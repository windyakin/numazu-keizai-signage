package sync

import (
	"context"
	"log"
	"time"

	"github.com/windyakin/numazu-keizai-signage/packages/edge/internal/model"
	"github.com/windyakin/numazu-keizai-signage/packages/edge/internal/store"
)

type AccessSyncer struct {
	up       *upstream
	rankings *store.Rankings
	media    *MediaSyncer
	interval time.Duration
}

func NewAccessSyncer(baseURL string, rankings *store.Rankings, media *MediaSyncer, interval time.Duration) *AccessSyncer {
	return &AccessSyncer{
		up:       newUpstream(baseURL),
		rankings: rankings,
		media:    media,
		interval: interval,
	}
}

func (a *AccessSyncer) Run(ctx context.Context) {
	if err := a.once(ctx); err != nil {
		log.Printf("access sync (initial): %v", err)
	}

	t := time.NewTicker(a.interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := a.once(ctx); err != nil {
				log.Printf("access sync: %v", err)
			}
		}
	}
}

// Refresh runs a single fetch synchronously.
func (a *AccessSyncer) Refresh(ctx context.Context) error {
	return a.once(ctx)
}

func (a *AccessSyncer) once(ctx context.Context) error {
	var res model.RankingsResponse
	if err := a.up.getJSON(ctx, "/api/signage/rankings", &res); err != nil {
		return err
	}

	now := time.Now().UTC()
	if err := a.rankings.Replace(ctx, res.Rankings, now); err != nil {
		return err
	}
	for _, rk := range res.Rankings {
		if rk.ImageURL != "" {
			if err := a.media.Enqueue(ctx, rk.ImageURL); err != nil {
				log.Printf("access sync: enqueue %s: %v", rk.ImageURL, err)
			}
		}
	}
	log.Printf("access sync: %d rankings replaced", len(res.Rankings))
	return nil
}
