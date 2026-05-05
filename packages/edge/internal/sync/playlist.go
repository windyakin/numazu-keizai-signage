package sync

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/windyakin/numazu-keizai-signage/packages/edge/internal/model"
	"github.com/windyakin/numazu-keizai-signage/packages/edge/internal/store"
)

const (
	playlistMaxRetries = 3
	playlistWorkers    = 4
)

type PlaylistSyncer struct {
	up             *upstream
	items          *store.PlaylistItems
	media          *store.PlaylistMedia
	mediaDir       string
	client         *http.Client
	trigger        chan struct{}
	interval       time.Duration
	upstreamAPIURL string
}

func NewPlaylistSyncer(
	baseURL string,
	items *store.PlaylistItems,
	media *store.PlaylistMedia,
	mediaDir string,
	interval time.Duration,
) *PlaylistSyncer {
	return &PlaylistSyncer{
		up:             newUpstream(baseURL),
		items:          items,
		media:          media,
		mediaDir:       mediaDir,
		client:         &http.Client{Timeout: 60 * time.Second},
		trigger:        make(chan struct{}, 1),
		interval:       interval,
		upstreamAPIURL: strings.TrimRight(baseURL, "/"),
	}
}

func (p *PlaylistSyncer) trig() {
	select {
	case p.trigger <- struct{}{}:
	default:
	}
}

// Refresh runs a single fetch synchronously. Media downloads run async via the trigger channel.
func (p *PlaylistSyncer) Refresh(ctx context.Context) error {
	return p.once(ctx)
}

// Run blocks until ctx is cancelled. Fetches once immediately then every interval.
func (p *PlaylistSyncer) Run(ctx context.Context) {
	if err := p.once(ctx); err != nil {
		log.Printf("playlist sync (initial): %v", err)
	}
	p.drain(ctx)

	t := time.NewTicker(p.interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := p.once(ctx); err != nil {
				log.Printf("playlist sync: %v", err)
			}
			p.drain(ctx)
		case <-p.trigger:
			p.drain(ctx)
		}
	}
}

func (p *PlaylistSyncer) once(ctx context.Context) error {
	var res model.UpstreamPlaylistResponse
	if err := p.up.getJSON(ctx, "/api/signage/playlist", &res); err != nil {
		return err
	}

	now := time.Now().UTC()
	items := make([]model.PlaylistItem, 0, len(res.Items))
	for _, raw := range res.Items {
		item := model.PlaylistItem{
			ID:          raw.ID,
			Type:        model.PlaylistItemType(raw.Type),
			Order:       raw.Order,
			DurationSec: raw.DurationSec,
		}

		if (item.Type == model.PlaylistItemImage || item.Type == model.PlaylistItemVideo) &&
			len(raw.Payload) > 0 && string(raw.Payload) != "null" {
			var payload model.UpstreamMediaPayload
			if err := json.Unmarshal(raw.Payload, &payload); err == nil && payload.StorageKey != "" {
				item.StorageKey = &payload.StorageKey
				item.MimeType = &payload.MimeType
			}
		}

		items = append(items, item)
	}

	if err := p.items.Replace(ctx, items, now); err != nil {
		return fmt.Errorf("replace playlist items: %w", err)
	}

	for _, item := range items {
		if item.StorageKey != nil {
			mimeType := ""
			if item.MimeType != nil {
				mimeType = *item.MimeType
			}
			if err := p.media.Enqueue(ctx, *item.StorageKey, mimeType); err != nil {
				log.Printf("playlist sync: enqueue %s: %v", *item.StorageKey, err)
			}
		}
	}

	log.Printf("playlist sync: %d items replaced", len(items))
	p.trig()
	return nil
}

func (p *PlaylistSyncer) drain(ctx context.Context) {
	entries, err := p.media.ListDownloadable(ctx, playlistMaxRetries)
	if err != nil {
		log.Printf("playlist media drain list: %v", err)
		return
	}
	if len(entries) == 0 {
		return
	}

	jobs := make(chan store.PlaylistMediaEntry)
	var wg sync.WaitGroup
	for i := 0; i < playlistWorkers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for e := range jobs {
				p.download(ctx, e)
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
	log.Printf("playlist media drain: processed %d entries", len(entries))
}

func (p *PlaylistSyncer) download(ctx context.Context, e store.PlaylistMediaEntry) {
	localPath, err := p.fetch(ctx, e.StorageKey, e.MimeType)
	if err != nil {
		log.Printf("playlist media download %s: %v", e.StorageKey, err)
		if markErr := p.media.MarkFailed(ctx, e.StorageKey); markErr != nil {
			log.Printf("playlist media mark failed: %v", markErr)
		}
		return
	}
	if err := p.media.MarkReady(ctx, e.StorageKey, localPath, time.Now().UTC()); err != nil {
		log.Printf("playlist media mark ready: %v", err)
	}
}

// fetch downloads the file via the upstream API's signage media proxy and saves it to mediaDir.
// Returns the path relative to mediaDir (forward-slash form).
func (p *PlaylistSyncer) fetch(ctx context.Context, storageKey, mimeType string) (string, error) {
	downloadURL := p.upstreamAPIURL + "/api/signage/media?key=" + url.QueryEscape(storageKey)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, downloadURL, nil)
	if err != nil {
		return "", err
	}
	resp, err := p.client.Do(req)
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
	absDir := filepath.Join(p.mediaDir, relDir)
	if err := os.MkdirAll(absDir, 0o755); err != nil {
		return "", err
	}

	absPath := filepath.Join(p.mediaDir, relPath)
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

	return filepath.ToSlash(relPath), nil
}
