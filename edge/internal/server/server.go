package server

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/windyakin/numazu-keizai-signage/edge/internal/config"
	"github.com/windyakin/numazu-keizai-signage/edge/internal/store"
)

// Refresher abstracts a syncer that can perform a one-shot refresh.
type Refresher interface {
	Refresh(ctx context.Context) error
}

type Server struct {
	cfg            *config.Config
	articles       *store.Articles
	rankings       *store.Rankings
	playlists      *store.Playlists
	playlistItems  *store.PlaylistItems
	media          *store.Media
	articlesSyncer Refresher
	rankingsSyncer Refresher
	playlistSyncer Refresher
}

func New(
	cfg *config.Config,
	articles *store.Articles,
	rankings *store.Rankings,
	playlists *store.Playlists,
	playlistItems *store.PlaylistItems,
	media *store.Media,
	articlesSyncer Refresher,
	rankingsSyncer Refresher,
	playlistSyncer Refresher,
) *Server {
	return &Server{
		cfg:            cfg,
		articles:       articles,
		rankings:       rankings,
		playlists:      playlists,
		playlistItems:  playlistItems,
		media:          media,
		articlesSyncer: articlesSyncer,
		rankingsSyncer: rankingsSyncer,
		playlistSyncer: playlistSyncer,
	}
}

func (s *Server) Handler() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware)

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	r.Get("/api/signage/articles", s.handleGetArticles)
	r.Get("/api/signage/rankings", s.handleGetRankings)
	r.Get("/api/signage/playlist", s.handleGetPlaylist)
	r.Post("/api/signage/playback", s.handlePostPlayback)
	r.Post("/api/signage/refresh", s.handleRefresh)
	r.Get("/media/*", s.handleGetMedia)

	// PoC 用: file:// から XHR/fetch でアクセスして CORS が通ることを検証する
	// エンドポイント。リクエストヘッダの主要項目をエコーバックする。
	r.Get("/poc/echo", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok":         true,
			"origin":     r.Header.Get("Origin"),
			"userAgent":  r.Header.Get("User-Agent"),
			"referer":    r.Header.Get("Referer"),
			"remoteAddr": r.RemoteAddr,
		})
	})

	return r
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
