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

	"github.com/windyakin/numazu-keizai-signage/packages/edge/internal/config"
	"github.com/windyakin/numazu-keizai-signage/packages/edge/internal/server"
	"github.com/windyakin/numazu-keizai-signage/packages/edge/internal/store"
	"github.com/windyakin/numazu-keizai-signage/packages/edge/internal/sync"
)

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
	playlistItems := store.NewPlaylistItems(db)
	playlistMedia := store.NewPlaylistMedia(db)

	mediaSyncer := sync.NewMediaSyncer(store.NewMedia(db), cfg.MediaDir, 30*time.Second, cfg.UpstreamAPIURL)
	feedSyncer := sync.NewFeedSyncer(cfg.UpstreamAPIURL, articles, mediaSyncer, interval)
	accessSyncer := sync.NewAccessSyncer(cfg.UpstreamAPIURL, rankings, mediaSyncer, interval)
	playlistSyncer := sync.NewPlaylistSyncer(cfg.UpstreamAPIURL, playlistItems, playlistMedia, cfg.MediaDir, interval)
	go mediaSyncer.Run(ctx)
	go feedSyncer.Run(ctx)
	go accessSyncer.Run(ctx)
	go playlistSyncer.Run(ctx)

	srv := &http.Server{
		Addr:    cfg.ListenAddr,
		Handler: server.New(cfg, articles, rankings, playlistItems, playlistMedia, feedSyncer, accessSyncer, playlistSyncer).Handler(),
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
