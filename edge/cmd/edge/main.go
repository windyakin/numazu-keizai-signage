package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/windyakin/numazu-keizai-signage/edge/internal/config"
	"github.com/windyakin/numazu-keizai-signage/edge/internal/server"
	"github.com/windyakin/numazu-keizai-signage/edge/internal/store"
	"github.com/windyakin/numazu-keizai-signage/edge/internal/sync"
)

// version はビルド時に -ldflags "-X main.version=..." で上書きできる。
// ハートビートで上流 api に報告される。
var version = "dev"

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	db, err := store.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("store: %v", err)
	}
	defer db.Close()

	if err := os.MkdirAll(cfg.MediaDir, 0o755); err != nil {
		log.Fatalf("mkdir media dir: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	interval := time.Duration(cfg.PollIntervalMin) * time.Minute

	articles := store.NewArticles(db)
	rankings := store.NewRankings(db)
	playlists := store.NewPlaylists(db)
	playlistItems := store.NewPlaylistItems(db)
	media := store.NewMedia(db)
	weather := store.NewWeather(db)

	mediaSyncer := sync.NewMediaSyncer(media, playlists, cfg.MediaDir, 30*time.Second, cfg.UpstreamAPIURL, cfg.SignageAPIToken)

	if n, err := mediaSyncer.VerifyReady(ctx); err != nil {
		log.Printf("media verify: %v", err)
	} else if n > 0 {
		log.Printf("media verify: reset %d broken entries to pending", n)
	}

	syncStatus := sync.NewSyncStatus()
	articlesSyncer := sync.NewArticlesSyncer(cfg.UpstreamAPIURL, cfg.SignageAPIToken, articles, mediaSyncer, interval, syncStatus)
	rankingsSyncer := sync.NewRankingsSyncer(cfg.UpstreamAPIURL, cfg.SignageAPIToken, rankings, mediaSyncer, interval, syncStatus)
	playlistSyncer := sync.NewPlaylistSyncer(cfg.UpstreamAPIURL, cfg.SignageAPIToken, playlists, playlistItems, mediaSyncer, interval, syncStatus)
	weatherSyncer := sync.NewWeatherSyncer(cfg.UpstreamAPIURL, cfg.SignageAPIToken, weather, interval, syncStatus)
	go mediaSyncer.Run(ctx)
	go articlesSyncer.Run(ctx)
	go rankingsSyncer.Run(ctx)
	go playlistSyncer.Run(ctx)
	go weatherSyncer.Run(ctx)

	// ハートビートはデバイス個別トークンでの認証が前提。トークン未設定では
	// api 側でデバイスを特定できず 401 になるだけなので起動しない。
	if cfg.SignageAPIToken != "" {
		heartbeatSyncer := sync.NewHeartbeatSyncer(cfg.UpstreamAPIURL, cfg.SignageAPIToken, time.Duration(cfg.HeartbeatIntervalSec)*time.Second, version)
		go heartbeatSyncer.Run(ctx)
	} else {
		log.Printf("heartbeat disabled: SIGNAGE_API_TOKEN is not set")
	}

	srv := &http.Server{
		Addr:    cfg.ListenAddr,
		Handler: server.New(cfg, articles, rankings, playlists, playlistItems, media, weather, syncStatus, articlesSyncer, rankingsSyncer, playlistSyncer, weatherSyncer).Handler(),
	}

	go func() {
		log.Printf("edge listening on %s", cfg.ListenAddr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("listen: %v", err)
		}
	}()

	<-ctx.Done()

	log.Printf("shutting down...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}
