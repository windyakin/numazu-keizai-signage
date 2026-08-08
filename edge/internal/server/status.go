package server

import (
	"encoding/json"
	"net/http"
)

type statusResponse struct {
	LastSuccess *string `json:"lastSuccess"`
}

func (s *Server) handleGetStatus(w http.ResponseWriter, r *http.Request) {
	var resp statusResponse
	if t := s.syncStatus.LastSuccess(); t != nil {
		ts := t.Format("2006-01-02T15:04:05Z")
		resp.LastSuccess = &ts
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
