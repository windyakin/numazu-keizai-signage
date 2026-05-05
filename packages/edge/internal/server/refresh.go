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
	Feed     refreshResultDTO `json:"feed"`
	Access   refreshResultDTO `json:"access"`
	Playlist refreshResultDTO `json:"playlist"`
}

func (s *Server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	res := refreshResponseDTO{
		Feed:     runRefresh(ctx, "feed", s.feedSyncer.Refresh),
		Access:   runRefresh(ctx, "access", s.accessSyncer.Refresh),
		Playlist: runRefresh(ctx, "playlist", s.playlistSyncer.Refresh),
	}

	status := http.StatusOK
	if !res.Feed.OK || !res.Access.OK || !res.Playlist.OK {
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
