package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/windyakin/numazu-keizai-signage/packages/edge/internal/model"
	"github.com/windyakin/numazu-keizai-signage/packages/edge/internal/store"
)

type PlaylistSyncer struct {
	up       *upstream
	items    *store.PlaylistItems
	media    *MediaSyncer
	interval time.Duration
}

func NewPlaylistSyncer(
	baseURL string,
	items *store.PlaylistItems,
	media *MediaSyncer,
	interval time.Duration,
) *PlaylistSyncer {
	return &PlaylistSyncer{
		up:       newUpstream(baseURL),
		items:    items,
		media:    media,
		interval: interval,
	}
}

// Refresh runs a single fetch synchronously. Media downloads are delegated to MediaSyncer.
func (p *PlaylistSyncer) Refresh(ctx context.Context) error {
	return p.once(ctx)
}

// Run blocks until ctx is cancelled. Fetches once immediately then every interval.
func (p *PlaylistSyncer) Run(ctx context.Context) {
	if err := p.once(ctx); err != nil {
		log.Printf("playlist sync (initial): %v", err)
	}

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

	swept, err := p.media.Sweep(ctx)
	if err != nil {
		log.Printf("playlist sync: sweep: %v", err)
	}
	log.Printf("playlist sync: %d items replaced, %d media swept", len(items), swept)
	return nil
}
