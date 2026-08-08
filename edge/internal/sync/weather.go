package sync

import (
	"context"
	"log"
	"time"

	"github.com/windyakin/numazu-keizai-signage/edge/internal/model"
	"github.com/windyakin/numazu-keizai-signage/edge/internal/store"
)

type WeatherSyncer struct {
	up       *upstream
	weather  *store.Weather
	interval time.Duration
	status   *SyncStatus
}

func NewWeatherSyncer(baseURL, token string, weather *store.Weather, interval time.Duration, status *SyncStatus) *WeatherSyncer {
	return &WeatherSyncer{
		up:       newUpstream(baseURL, token),
		weather:  weather,
		interval: interval,
		status:   status,
	}
}

func (s *WeatherSyncer) Run(ctx context.Context) {
	if err := s.once(ctx); err != nil {
		log.Printf("weather sync (initial): %v", err)
		s.status.RecordError("weather", err)
	} else {
		s.status.RecordSuccess("weather")
	}

	t := time.NewTicker(s.interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := s.once(ctx); err != nil {
				log.Printf("weather sync: %v", err)
				s.status.RecordError("weather", err)
			} else {
				s.status.RecordSuccess("weather")
			}
		}
	}
}

// Refresh runs a single fetch synchronously.
func (s *WeatherSyncer) Refresh(ctx context.Context) error {
	err := s.once(ctx)
	if err != nil {
		s.status.RecordError("weather", err)
	} else {
		s.status.RecordSuccess("weather")
	}
	return err
}

func (s *WeatherSyncer) once(ctx context.Context) error {
	var res model.WeatherResponse
	if err := s.up.getJSON(ctx, "/api/signage/weather", &res); err != nil {
		return err
	}

	now := time.Now().UTC()
	if err := s.weather.Replace(ctx, res.Days, now); err != nil {
		return err
	}
	log.Printf("weather sync: %d days replaced", len(res.Days))
	return nil
}
