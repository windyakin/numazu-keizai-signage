package sync

import (
	"context"
	"log"
	"time"

	"github.com/windyakin/numazu-keizai-signage/packages/edge/internal/model"
	"github.com/windyakin/numazu-keizai-signage/packages/edge/internal/store"
)

type FeedSyncer struct {
	up       *upstream
	articles *store.Articles
	media    *MediaSyncer
	interval time.Duration
}

func NewFeedSyncer(baseURL string, articles *store.Articles, media *MediaSyncer, interval time.Duration) *FeedSyncer {
	return &FeedSyncer{
		up:       newUpstream(baseURL),
		articles: articles,
		media:    media,
		interval: interval,
	}
}

// Run blocks until ctx is cancelled. Fetches once immediately then every interval.
func (f *FeedSyncer) Run(ctx context.Context) {
	if err := f.once(ctx); err != nil {
		log.Printf("feed sync (initial): %v", err)
	}

	t := time.NewTicker(f.interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := f.once(ctx); err != nil {
				log.Printf("feed sync: %v", err)
			}
		}
	}
}

// Refresh runs a single fetch synchronously.
func (f *FeedSyncer) Refresh(ctx context.Context) error {
	return f.once(ctx)
}

func (f *FeedSyncer) once(ctx context.Context) error {
	var res model.ArticlesResponse
	if err := f.up.getJSON(ctx, "/api/signage/articles", &res); err != nil {
		return err
	}

	now := time.Now().UTC()
	for _, a := range res.Articles {
		if err := f.articles.Upsert(ctx, a, now); err != nil {
			return err
		}
		if a.ImageURL != "" {
			if err := f.media.Enqueue(ctx, a.ImageURL); err != nil {
				log.Printf("feed sync: enqueue %s: %v", a.ImageURL, err)
			}
		}
	}
	log.Printf("feed sync: %d articles upserted", len(res.Articles))
	return nil
}
