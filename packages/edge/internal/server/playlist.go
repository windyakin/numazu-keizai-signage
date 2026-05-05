package server

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/windyakin/numazu-keizai-signage/packages/edge/internal/model"
)

type playlistItemDTO struct {
	ID          string `json:"id"`
	Type        string `json:"type"`
	Order       int    `json:"order"`
	DurationSec *int   `json:"durationSec"`
	Payload     any    `json:"payload"`
}

type mediaPayloadDTO struct {
	URL      string `json:"url"`
	MimeType string `json:"mimeType"`
}

type playlistResponseDTO struct {
	Items []playlistItemDTO `json:"items"`
}

func (s *Server) handleGetPlaylist(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	playlistItems, err := s.playlistItems.List(ctx)
	if err != nil {
		log.Printf("playlist list: %v", err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// Build playlist items
	items := make([]playlistItemDTO, 0, len(playlistItems))
	for _, item := range playlistItems {
		dto := playlistItemDTO{
			ID:          item.ID,
			Type:        string(item.Type),
			Order:       item.Order,
			DurationSec: item.DurationSec,
			Payload:     nil,
		}

		switch item.Type {
		case model.PlaylistItemArticleLatest, model.PlaylistItemArticleRandom, model.PlaylistItemRanking:
			// payload is always null; signage fetches data independently
		case model.PlaylistItemImage, model.PlaylistItemVideo:
			if item.StorageKey != nil {
				localPath, err := s.media.LocalPath(ctx, *item.StorageKey)
				if err != nil {
					log.Printf("media local path %s: %v", *item.StorageKey, err)
				} else if localPath != "" {
					mimeType := ""
					if item.MimeType != nil {
						mimeType = *item.MimeType
					}
					dto.Payload = mediaPayloadDTO{
						URL:      buildMediaURL(r, s.cfg.MediaDir, localPath),
						MimeType: mimeType,
					}
				}
			}
		}

		items = append(items, dto)
	}

	res := playlistResponseDTO{Items: items}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(res)
}
