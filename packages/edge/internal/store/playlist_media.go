package store

import (
	"context"
	"database/sql"
	"time"
)

// PlaylistMediaEntry is a row from the playlist_media table.
type PlaylistMediaEntry struct {
	StorageKey string
	MimeType   string
	Retries    int
}

type PlaylistMedia struct {
	db *sql.DB
}

func NewPlaylistMedia(db *sql.DB) *PlaylistMedia {
	return &PlaylistMedia{db: db}
}

// Enqueue registers a storage URL for download if not already tracked.
func (m *PlaylistMedia) Enqueue(ctx context.Context, storageURL, mimeType string) error {
	_, err := m.db.ExecContext(ctx, `
		INSERT INTO playlist_media (storage_key, local_path, mime_type, status, retries)
		VALUES (?, '', ?, 'pending', 0)
		ON CONFLICT(storage_key) DO NOTHING
	`, storageURL, mimeType)
	return err
}

// ListDownloadable returns entries that need to be (re)downloaded.
func (m *PlaylistMedia) ListDownloadable(ctx context.Context, maxRetries int) ([]PlaylistMediaEntry, error) {
	rows, err := m.db.QueryContext(ctx, `
		SELECT storage_key, mime_type, retries
		FROM playlist_media
		WHERE status = 'pending' OR (status = 'failed' AND retries < ?)
	`, maxRetries)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []PlaylistMediaEntry
	for rows.Next() {
		var e PlaylistMediaEntry
		if err := rows.Scan(&e.StorageKey, &e.MimeType, &e.Retries); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// MarkReady marks a playlist media entry as successfully downloaded.
func (m *PlaylistMedia) MarkReady(ctx context.Context, storageURL, localPath string, at time.Time) error {
	_, err := m.db.ExecContext(ctx, `
		UPDATE playlist_media
		SET local_path = ?, status = 'ready', downloaded_at = ?
		WHERE storage_key = ?
	`, localPath, at, storageURL)
	return err
}

// MarkFailed increments the retry count and marks the entry as failed.
func (m *PlaylistMedia) MarkFailed(ctx context.Context, storageURL string) error {
	_, err := m.db.ExecContext(ctx, `
		UPDATE playlist_media
		SET status = 'failed', retries = retries + 1
		WHERE storage_key = ?
	`, storageURL)
	return err
}

// LocalPath returns the local path for a storage URL if the file is ready,
// or empty string otherwise.
func (m *PlaylistMedia) LocalPath(ctx context.Context, storageURL string) (string, error) {
	var localPath, status string
	err := m.db.QueryRowContext(ctx, `
		SELECT local_path, status FROM playlist_media WHERE storage_key = ?
	`, storageURL).Scan(&localPath, &status)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if status != "ready" {
		return "", nil
	}
	return localPath, nil
}
