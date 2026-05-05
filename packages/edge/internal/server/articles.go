package server

import (
	"encoding/json"
	"log"
	"net/http"
)

type articleDTO struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	ImageURL    string  `json:"imageUrl"`
	Description *string `json:"description"`
	Start       string  `json:"start"`
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
		// ListReady は ImageKey フィールドにキャッシュ済みファイルの local_path を詰めて返す。
		localPath := ""
		if a.ImageKey != nil {
			localPath = *a.ImageKey
		}
		res.Articles = append(res.Articles, articleDTO{
			ID:          a.ID,
			Title:       a.Title,
			ImageURL:    buildMediaURL(r, s.cfg.MediaDir, localPath),
			Description: a.Description,
			Start:       a.Start.UTC().Format("2006-01-02T15:04:05.000Z"),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(res)
}
