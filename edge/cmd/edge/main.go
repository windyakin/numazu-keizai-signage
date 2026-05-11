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

	mediaSyncer := sync.NewMediaSyncer(media, playlists, cfg.MediaDir, 30*time.Second, cfg.UpstreamAPIURL)
	articlesSyncer := sync.NewArticlesSyncer(cfg.UpstreamAPIURL, articles, mediaSyncer, interval)
	rankingsSyncer := sync.NewRankingsSyncer(cfg.UpstreamAPIURL, rankings, mediaSyncer, interval)
	playlistSyncer := sync.NewPlaylistSyncer(cfg.UpstreamAPIURL, playlists, playlistItems, mediaSyncer, interval)
	go mediaSyncer.Run(ctx)
	go articlesSyncer.Run(ctx)
	go rankingsSyncer.Run(ctx)
	go playlistSyncer.Run(ctx)

	srv := &http.Server{
		Addr:    cfg.ListenAddr,
		Handler: server.New(cfg, articles, rankings, playlists, playlistItems, media, articlesSyncer, rankingsSyncer, playlistSyncer).Handler(),
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
