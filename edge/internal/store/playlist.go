package store

import (
	"context"
	"database/sql"
	"time"

	"github.com/windyakin/numazu-keizai-signage/edge/internal/model"
)

type PlaylistItems struct {
	db *sql.DB
}

func NewPlaylistItems(db *sql.DB) *PlaylistItems {
	return &PlaylistItems{db: db}
}

// Replace atomically replaces playlist items belonging to the given
// playlistId. Items of other playlists are kept untouched (Cleanup on the
// playlists table is responsible for evicting stale playlists and their
// items). Item ids are cleaned up first because each playlist version has
// its own freshly-generated cuid set, so id collisions between versions
// shouldn't happen — but we delete by playlist_id to keep the table tidy
// when upstream resends the same playlist.
func (p *PlaylistItems) Replace(ctx context.Context, playlistID string, items []model.PlaylistItem, fetchedAt time.Time) error {
	tx, err := p.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `DELETE FROM playlist_items WHERE playlist_id = ?`, playlistID); err != nil {
		return err
	}

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO playlist_items (id, playlist_id, type, item_order, duration_sec, storage_key, mime_type, is_fullscreen, fetched_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, item := range items {
		if _, err := stmt.ExecContext(ctx,
			item.ID, playlistID, string(item.Type), item.Order, item.DurationSec,
			item.StorageKey, item.MimeType, item.IsFullscreen, fetchedAt,
		); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// List returns the playlist items belonging to the given playlistId, ordered
// by item_order ascending.
func (p *PlaylistItems) List(ctx context.Context, playlistID string) ([]model.PlaylistItem, error) {
	rows, err := p.db.QueryContext(ctx, `
		SELECT id, type, item_order, duration_sec, storage_key, mime_type, is_fullscreen
		FROM playlist_items
		WHERE playlist_id = ?
		ORDER BY item_order ASC
	`, playlistID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []model.PlaylistItem
	for rows.Next() {
		var item model.PlaylistItem
		var itemType string
		if err := rows.Scan(
			&item.ID, &itemType, &item.Order, &item.DurationSec,
			&item.StorageKey, &item.MimeType, &item.IsFullscreen,
		); err != nil {
			return nil, err
		}
		item.Type = model.PlaylistItemType(itemType)
		out = append(out, item)
	}
	return out, rows.Err()
}
