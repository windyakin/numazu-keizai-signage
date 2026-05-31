package sync

import (
	"context"
	"log"
	"time"

	"github.com/windyakin/numazu-keizai-signage/edge/internal/model"
	"github.com/windyakin/numazu-keizai-signage/edge/internal/store"
)

type ArticlesSyncer struct {
	up       *upstream
	articles *store.Articles
	media    *MediaSyncer
	interval time.Duration
}

func NewArticlesSyncer(baseURL string, articles *store.Articles, media *MediaSyncer, interval time.Duration) *ArticlesSyncer {
	return &ArticlesSyncer{
		up:       newUpstream(baseURL),
		articles: articles,
		media:    media,
		interval: interval,
	}
}

// Run blocks until ctx is cancelled. Fetches once immediately then every interval.
func (s *ArticlesSyncer) Run(ctx context.Context) {
	if err := s.once(ctx); err != nil {
		log.Printf("articles sync (initial): %v", err)
	}

	t := time.NewTicker(s.interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := s.once(ctx); err != nil {
				log.Printf("articles sync: %v", err)
			}
		}
	}
}

// Refresh runs a single fetch synchronously.
func (s *ArticlesSyncer) Refresh(ctx context.Context) error {
	return s.once(ctx)
}

func (s *ArticlesSyncer) once(ctx context.Context) error {
	var res model.ArticlesResponse
	if err := s.up.getJSON(ctx, "/api/signage/articles", &res); err != nil {
		return err
	}

	now := time.Now().UTC()
	removed, err := s.articles.Sync(ctx, res.Articles, now)
	if err != nil {
		return err
	}
	for _, a := range res.Articles {
		if a.ImageKey != nil && *a.ImageKey != "" {
			if err := s.media.Enqueue(ctx, *a.ImageKey, ""); err != nil {
				log.Printf("articles sync: enqueue %s: %v", *a.ImageKey, err)
			}
		}
		// QR コードキー (`qr/{base64url(url)}`) も同じメディアプールに載せる。
		// MediaSyncer.fetch が prefix を見て専用エンドポイントから取得する。
		if a.QRKey != nil && *a.QRKey != "" {
			if err := s.media.Enqueue(ctx, *a.QRKey, "image/png"); err != nil {
				log.Printf("articles sync: enqueue qr %s: %v", *a.QRKey, err)
			}
		}
	}
	swept, err := s.media.Sweep(ctx)
	if err != nil {
		log.Printf("articles sync: sweep: %v", err)
	}
	log.Printf("articles sync: %d upserted, %d removed, %d media swept", len(res.Articles), removed, swept)
	return nil
}
