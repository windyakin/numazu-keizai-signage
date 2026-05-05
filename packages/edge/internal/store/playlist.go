package store

import (
	"context"
	"database/sql"
	"time"

	"github.com/windyakin/numazu-keizai-signage/packages/edge/internal/model"
)

type PlaylistItems struct {
	db *sql.DB
}

func NewPlaylistItems(db *sql.DB) *PlaylistItems {
	return &PlaylistItems{db: db}
}

// Replace atomically replaces all playlist items with the provided set.
func (p *PlaylistItems) Replace(ctx context.Context, items []model.PlaylistItem, fetchedAt time.Time) error {
	tx, err := p.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `DELETE FROM playlist_items`); err != nil {
		return err
	}

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO playlist_items (id, type, item_order, duration_sec, storage_key, mime_type, fetched_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, item := range items {
		if _, err := stmt.ExecContext(ctx,
			item.ID, string(item.Type), item.Order, item.DurationSec,
			item.StorageKey, item.MimeType, fetchedAt,
		); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// List returns all playlist items ordered by item_order ascending.
func (p *PlaylistItems) List(ctx context.Context) ([]model.PlaylistItem, error) {
	rows, err := p.db.QueryContext(ctx, `
		SELECT id, type, item_order, duration_sec, storage_key, mime_type
		FROM playlist_items
		ORDER BY item_order ASC
	`)
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
			&item.StorageKey, &item.MimeType,
		); err != nil {
			return nil, err
		}
		item.Type = model.PlaylistItemType(itemType)
		out = append(out, item)
	}
	return out, rows.Err()
}
