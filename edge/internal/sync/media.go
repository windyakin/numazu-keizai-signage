package sync

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/windyakin/numazu-keizai-signage/edge/internal/store"
)

const mediaEndpointPath = "/api/signage/media"

const (
	mediaMaxRetries = 3
	mediaWorkers    = 4
)

type MediaSyncer struct {
	media          *store.Media
	mediaDir       string
	interval       time.Duration
	client         *http.Client
	trigger        chan struct{}
	upstreamAPIURL string
}

func NewMediaSyncer(media *store.Media, mediaDir string, interval time.Duration, upstreamAPIURL string) *MediaSyncer {
	return &MediaSyncer{
		media:          media,
		mediaDir:       mediaDir,
		interval:       interval,
		client:         &http.Client{Timeout: 60 * time.Second},
		trigger:        make(chan struct{}, 1),
		upstreamAPIURL: strings.TrimRight(upstreamAPIURL, "/"),
	}
}

// Enqueue tracks the storage key as downloadable and triggers a drain.
// mimeType is optional ("" when the upstream did not provide one).
func (m *MediaSyncer) Enqueue(ctx context.Context, storageKey, mimeType string) error {
	if err := m.media.Enqueue(ctx, storageKey, mimeType); err != nil {
		return err
	}
	m.trig()
	return nil
}

func (m *MediaSyncer) trig() {
	select {
	case m.trigger <- struct{}{}:
	default:
	}
}

// Run blocks until ctx is cancelled. Drains on startup, on trigger, and on ticker.
func (m *MediaSyncer) Run(ctx context.Context) {
	m.drain(ctx)

	t := time.NewTicker(m.interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			m.drain(ctx)
		case <-m.trigger:
			m.drain(ctx)
		}
	}
}

func (m *MediaSyncer) drain(ctx context.Context) {
	entries, err := m.media.ListDownloadable(ctx, mediaMaxRetries)
	if err != nil {
		log.Printf("media drain list: %v", err)
		return
	}
	if len(entries) == 0 {
		return
	}

	jobs := make(chan store.MediaEntry)
	var wg sync.WaitGroup
	for i := 0; i < mediaWorkers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for e := range jobs {
				m.download(ctx, e)
			}
		}()
	}
	for _, e := range entries {
		select {
		case <-ctx.Done():
			close(jobs)
			wg.Wait()
			return
		case jobs <- e:
		}
	}
	close(jobs)
	wg.Wait()
	log.Printf("media drain: processed %d entries", len(entries))
}

func (m *MediaSyncer) download(ctx context.Context, e store.MediaEntry) {
	localPath, err := m.fetch(ctx, e.StorageKey, e.MimeType)
	if err != nil {
		log.Printf("media download %s: %v", e.StorageKey, err)
		if markErr := m.media.MarkFailed(ctx, e.StorageKey); markErr != nil {
			log.Printf("media mark failed: %v", markErr)
		}
		return
	}
	if err := m.media.MarkReady(ctx, e.StorageKey, localPath, time.Now().UTC()); err != nil {
		log.Printf("media mark ready: %v", err)
	}
}

// fetch downloads the object via the upstream `/api/signage/media?key=<storageKey>`
// endpoint to MEDIA_DIR/<ab>/<cd>/<sha>.<ext> and returns the path relative to
// MEDIA_DIR (e.g. "ab/cd/abcdef...jpg"). mimeType is used as a fallback for
// extension detection only when the storage key has no extension and the
// upstream Content-Type is missing.
func (m *MediaSyncer) fetch(ctx context.Context, storageKey, mimeType string) (string, error) {
	downloadURL := m.upstreamAPIURL + mediaEndpointPath + "?key=" + url.QueryEscape(storageKey)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, downloadURL, nil)
	if err != nil {
		return "", err
	}
	resp, err := m.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return "", fmt.Errorf("status %d", resp.StatusCode)
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = mimeType
	}
	sum := sha256.Sum256([]byte(storageKey))
	hash := hex.EncodeToString(sum[:])
	ext := pickExtension(storageKey, contentType)

	relDir := filepath.Join(hash[0:2], hash[2:4])
	relPath := filepath.Join(relDir, hash+ext)
	absDir := filepath.Join(m.mediaDir, relDir)
	if err := os.MkdirAll(absDir, 0o755); err != nil {
		return "", err
	}

	absPath := filepath.Join(m.mediaDir, relPath)
	tmpPath := absPath + ".tmp"
	f, err := os.Create(tmpPath)
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(f, resp.Body); err != nil {
		f.Close()
		os.Remove(tmpPath)
		return "", err
	}
	if err := f.Close(); err != nil {
		os.Remove(tmpPath)
		return "", err
	}
	if err := os.Rename(tmpPath, absPath); err != nil {
		os.Remove(tmpPath)
		return "", err
	}

	// Store forward-slash form for URL composition convenience.
	return filepath.ToSlash(relPath), nil
}

// Sweep deletes media_cache rows and on-disk files whose storage_key is no
// longer referenced by any of articles / rankings / playlist_items. Returns
// the number of entries actually removed. Best-effort: filesystem and DB
// errors per entry are logged and the loop continues.
func (m *MediaSyncer) Sweep(ctx context.Context) (int, error) {
	orphans, err := m.media.ListOrphans(ctx)
	if err != nil {
		return 0, err
	}
	removed := 0
	for _, e := range orphans {
		if e.LocalPath != "" {
			abs := filepath.Join(m.mediaDir, filepath.FromSlash(e.LocalPath))
			if err := os.Remove(abs); err != nil && !os.IsNotExist(err) {
				log.Printf("media sweep remove %s: %v", abs, err)
			}
		}
		if err := m.media.Delete(ctx, e.StorageKey); err != nil {
			log.Printf("media sweep delete %s: %v", e.StorageKey, err)
			continue
		}
		removed++
	}
	return removed, nil
}

func pickExtension(storageKey, contentType string) string {
	if u, err := url.Parse(storageKey); err == nil {
		if ext := path.Ext(u.Path); ext != "" && len(ext) <= 5 {
			return strings.ToLower(ext)
		}
	}
	if contentType != "" {
		if mt, _, err := mime.ParseMediaType(contentType); err == nil {
			if exts, _ := mime.ExtensionsByType(mt); len(exts) > 0 {
				return exts[0]
			}
		}
	}
	return ".bin"
}
