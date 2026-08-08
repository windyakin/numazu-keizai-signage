package sync

import (
	"context"
	"log"
	"time"

	"github.com/windyakin/numazu-keizai-signage/edge/internal/model"
	"github.com/windyakin/numazu-keizai-signage/edge/internal/store"
)

type RankingsSyncer struct {
	up       *upstream
	rankings *store.Rankings
	media    *MediaSyncer
	interval time.Duration
	status   *SyncStatus
}

func NewRankingsSyncer(baseURL, token string, rankings *store.Rankings, media *MediaSyncer, interval time.Duration, status *SyncStatus) *RankingsSyncer {
	return &RankingsSyncer{
		up:       newUpstream(baseURL, token),
		rankings: rankings,
		media:    media,
		interval: interval,
		status:   status,
	}
}

func (s *RankingsSyncer) Run(ctx context.Context) {
	if err := s.once(ctx); err != nil {
		log.Printf("rankings sync (initial): %v", err)
		s.status.RecordError("rankings", err)
	} else {
		s.status.RecordSuccess("rankings")
	}

	t := time.NewTicker(s.interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := s.once(ctx); err != nil {
				log.Printf("rankings sync: %v", err)
				s.status.RecordError("rankings", err)
			} else {
				s.status.RecordSuccess("rankings")
			}
		}
	}
}

// Refresh runs a single fetch synchronously.
func (s *RankingsSyncer) Refresh(ctx context.Context) error {
	err := s.once(ctx)
	if err != nil {
		s.status.RecordError("rankings", err)
	} else {
		s.status.RecordSuccess("rankings")
	}
	return err
}

func (s *RankingsSyncer) once(ctx context.Context) error {
	var res model.RankingsResponse
	if err := s.up.getJSON(ctx, "/api/signage/rankings", &res); err != nil {
		return err
	}

	now := time.Now().UTC()
	if err := s.rankings.Replace(ctx, res.Rankings, now); err != nil {
		return err
	}
	for _, rk := range res.Rankings {
		if rk.ImageKey != nil && *rk.ImageKey != "" {
			if err := s.media.Enqueue(ctx, *rk.ImageKey, ""); err != nil {
				log.Printf("rankings sync: enqueue %s: %v", *rk.ImageKey, err)
			}
		}
	}
	swept, err := s.media.Sweep(ctx)
	if err != nil {
		log.Printf("rankings sync: sweep: %v", err)
	}
	log.Printf("rankings sync: %d replaced, %d media swept", len(res.Rankings), swept)
	return nil
}
