package model

import "encoding/json"

// PlaylistItemType represents the type of a playlist item.
type PlaylistItemType string

const (
	PlaylistItemArticleLatest PlaylistItemType = "ARTICLE_LATEST"
	PlaylistItemArticleRandom PlaylistItemType = "ARTICLE_RANDOM"
	PlaylistItemRanking       PlaylistItemType = "RANKING"
	PlaylistItemImage         PlaylistItemType = "IMAGE"
	PlaylistItemVideo         PlaylistItemType = "VIDEO"
)

// PlaylistItem is the locally-stored representation of a playlist entry.
type PlaylistItem struct {
	ID           string
	Type         PlaylistItemType
	Order        int
	DurationSec  *int
	StorageKey   *string // non-nil for IMAGE / VIDEO
	MimeType     *string // non-nil for IMAGE / VIDEO
	IsFullscreen bool    // meaningful for IMAGE / VIDEO
}

// UpstreamPlaylistResponse is the JSON structure returned by the upstream API.
type UpstreamPlaylistResponse struct {
	Items []UpstreamPlaylistItem `json:"items"`
}

// UpstreamPlaylistItem holds raw JSON payload (polymorphic per Type).
type UpstreamPlaylistItem struct {
	ID          string          `json:"id"`
	Type        string          `json:"type"`
	Order       int             `json:"order"`
	DurationSec *int            `json:"durationSec"`
	Payload     json.RawMessage `json:"payload"`
}

// UpstreamMediaPayload is the payload for IMAGE / VIDEO items.
type UpstreamMediaPayload struct {
	StorageKey   string `json:"storageKey"`
	MimeType     string `json:"mimeType"`
	IsFullscreen bool   `json:"isFullscreen"`
}
