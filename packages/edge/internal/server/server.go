package server

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/windyakin/numazu-keizai-signage/packages/edge/internal/config"
	"github.com/windyakin/numazu-keizai-signage/packages/edge/internal/store"
)

type Server struct {
	cfg      *config.Config
	articles *store.Articles
	rankings *store.Rankings
}

func New(cfg *config.Config, articles *store.Articles, rankings *store.Rankings) *Server {
	return &Server{cfg: cfg, articles: articles, rankings: rankings}
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

	r.Get("/api/feed/articles", s.handleGetArticles)
	r.Get("/api/access/rankings", s.handleGetRankings)

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
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
