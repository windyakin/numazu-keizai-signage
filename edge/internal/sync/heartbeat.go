package sync

import (
	"context"
	"log"
	"time"
)

// HeartbeatSyncer は上流 api に自分の生存を定期通知する。
// デバイスの識別は Bearer トークン (デバイス個別トークン) で行われるため、
// ペイロードに識別子は載せない。オンライン/オフラインの判定は api 側が
// 最終受信時刻からの経過時間で導出する。
type HeartbeatSyncer struct {
	up       *upstream
	interval time.Duration
	version  string
}

func NewHeartbeatSyncer(baseURL, token string, interval time.Duration, version string) *HeartbeatSyncer {
	return &HeartbeatSyncer{
		up:       newUpstream(baseURL, token),
		interval: interval,
		version:  version,
	}
}

func (s *HeartbeatSyncer) Run(ctx context.Context) {
	if err := s.once(ctx); err != nil {
		log.Printf("heartbeat (initial): %v", err)
	}

	t := time.NewTicker(s.interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := s.once(ctx); err != nil {
				log.Printf("heartbeat: %v", err)
			}
		}
	}
}

type heartbeatPayload struct {
	Version string `json:"version,omitempty"`
}

func (s *HeartbeatSyncer) once(ctx context.Context) error {
	return s.up.postJSON(ctx, "/api/signage/heartbeat", heartbeatPayload{Version: s.version}, nil)
}
