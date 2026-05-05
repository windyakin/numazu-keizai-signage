package server

import (
	"encoding/json"
	"log"
	"net/http"
)

type rankingDTO struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	ImageURL string `json:"imageUrl"`
	Rank     int    `json:"rank"`
	Start    string `json:"start"`
}

type rankingsResponse struct {
	Rankings  []rankingDTO `json:"rankings"`
	FetchedAt *string      `json:"fetchedAt"`
}

func (s *Server) handleGetRankings(w http.ResponseWriter, r *http.Request) {
	rankings, fetchedAt, err := s.rankings.ListReady(r.Context())
	if err != nil {
		log.Printf("rankings list: %v", err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	res := rankingsResponse{
		Rankings: make([]rankingDTO, 0, len(rankings)),
	}
	for _, rk := range rankings {
		res.Rankings = append(res.Rankings, rankingDTO{
			ID:       rk.ID,
			Title:    rk.Title,
			ImageURL: joinMediaURL(s.cfg.MediaURLPrefix, rk.ImageURL),
			Rank:     rk.Rank,
			Start:    rk.Start.UTC().Format("2006-01-02T15:04:05.000Z"),
		})
	}
	if fetchedAt != nil {
		s := fetchedAt.UTC().Format("2006-01-02T15:04:05.000Z")
		res.FetchedAt = &s
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(res)
}
