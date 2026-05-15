package server

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"
)

type playbackReportRequest struct {
	PlaylistID    string `json:"playlistId"`
	CurrentItemID string `json:"currentItemId"`
	Looped        bool   `json:"looped"`
}

func (s *Server) handlePostPlayback(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req playbackReportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}
	if req.PlaylistID == "" {
		http.Error(w, `{"error":"playlistId required"}`, http.StatusBadRequest)
		return
	}

	now := time.Now().UTC()
	if err := s.playlists.MarkActive(ctx, req.PlaylistID, now); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			http.Error(w, `{"error":"unknown playlistId"}`, http.StatusNotFound)
			return
		}
		log.Printf("playback mark active %s: %v", req.PlaylistID, err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	if req.Looped {
		if err := s.playlists.IncrementPlayCount(ctx, req.PlaylistID); err != nil {
			log.Printf("playback play_count++ %s: %v", req.PlaylistID, err)
		}
	}

	cleaned, err := s.playlists.Cleanup(ctx)
	if err != nil {
		log.Printf("playback cleanup: %v", err)
	}
	if cleaned > 0 {
		log.Printf("playback report: id=%s looped=%v current=%s, %d playlists released",
			req.PlaylistID, req.Looped, req.CurrentItemID, cleaned)
	}

	w.WriteHeader(http.StatusNoContent)
}
