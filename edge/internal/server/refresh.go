package server

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
)

type refreshResultDTO struct {
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

type refreshResponseDTO struct {
	Articles refreshResultDTO `json:"articles"`
	Rankings refreshResultDTO `json:"rankings"`
	Playlist refreshResultDTO `json:"playlist"`
}

func (s *Server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	res := refreshResponseDTO{
		Articles: runRefresh(ctx, "articles", s.articlesSyncer.Refresh),
		Rankings: runRefresh(ctx, "rankings", s.rankingsSyncer.Refresh),
		Playlist: runRefresh(ctx, "playlist", s.playlistSyncer.Refresh),
	}

	status := http.StatusOK
	if !res.Articles.OK || !res.Rankings.OK || !res.Playlist.OK {
		status = http.StatusInternalServerError
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(res)
}

func runRefresh(ctx context.Context, name string, fn func(context.Context) error) refreshResultDTO {
	if err := fn(ctx); err != nil {
		log.Printf("refresh %s: %v", name, err)
		return refreshResultDTO{OK: false, Error: err.Error()}
	}
	return refreshResultDTO{OK: true}
}
