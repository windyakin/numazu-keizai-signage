package server

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
)

type articleDTO struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	ImageURL string `json:"imageUrl"`
	Start    string `json:"start"`
}

type articlesResponse struct {
	Articles []articleDTO `json:"articles"`
}

func (s *Server) handleGetArticles(w http.ResponseWriter, r *http.Request) {
	articles, err := s.articles.ListReady(r.Context())
	if err != nil {
		log.Printf("articles list: %v", err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	res := articlesResponse{Articles: make([]articleDTO, 0, len(articles))}
	for _, a := range articles {
		res.Articles = append(res.Articles, articleDTO{
			ID:       a.ID,
			Title:    a.Title,
			ImageURL: joinMediaURL(s.cfg.MediaURLPrefix, a.ImageURL),
			Start:    a.Start.UTC().Format("2006-01-02T15:04:05.000Z"),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(res)
}

// joinMediaURL composes the URL/path returned to signage by combining
// MEDIA_URL_PREFIX (e.g. "./media") with media_cache.local_path (e.g. "ab/cd/<sha>.png").
// Always uses '/' as separator since the result is a URL.
func joinMediaURL(prefix, localPath string) string {
	prefix = strings.TrimRight(prefix, "/")
	localPath = strings.TrimLeft(localPath, "/")
	return prefix + "/" + localPath
}
