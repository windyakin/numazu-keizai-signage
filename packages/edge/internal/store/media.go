package store

import (
	"context"
	"database/sql"
	"time"
)

type MediaStatus string

const (
	MediaPending MediaStatus = "pending"
	MediaReady   MediaStatus = "ready"
	MediaFailed  MediaStatus = "failed"
)

type MediaEntry struct {
	SourceURL    string
	LocalPath    string
	Status       MediaStatus
	Retries      int
	DownloadedAt *time.Time
}

type Media struct {
	db *sql.DB
}

func NewMedia(db *sql.DB) *Media {
	return &Media{db: db}
}

// Enqueue inserts a pending entry if the source URL is not yet tracked.
// Existing entries (ready / failed / pending) are left untouched.
func (m *Media) Enqueue(ctx context.Context, sourceURL string) error {
	_, err := m.db.ExecContext(ctx, `
		INSERT INTO media_cache (source_url, local_path, status, retries)
		VALUES (?, '', ?, 0)
		ON CONFLICT(source_url) DO NOTHING
	`, sourceURL, MediaPending)
	return err
}

// ListDownloadable returns entries that need to be (re)downloaded:
// pending, or failed with retries < maxRetries.
func (m *Media) ListDownloadable(ctx context.Context, maxRetries int) ([]MediaEntry, error) {
	rows, err := m.db.QueryContext(ctx, `
		SELECT source_url, local_path, status, retries
		FROM media_cache
		WHERE status = ? OR (status = ? AND retries < ?)
	`, MediaPending, MediaFailed, maxRetries)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []MediaEntry
	for rows.Next() {
		var e MediaEntry
		if err := rows.Scan(&e.SourceURL, &e.LocalPath, &e.Status, &e.Retries); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (m *Media) MarkReady(ctx context.Context, sourceURL, localPath string, at time.Time) error {
	_, err := m.db.ExecContext(ctx, `
		UPDATE media_cache
		SET local_path = ?, status = ?, downloaded_at = ?
		WHERE source_url = ?
	`, localPath, MediaReady, at, sourceURL)
	return err
}

func (m *Media) MarkFailed(ctx context.Context, sourceURL string) error {
	_, err := m.db.ExecContext(ctx, `
		UPDATE media_cache
		SET status = ?, retries = retries + 1
		WHERE source_url = ?
	`, MediaFailed, sourceURL)
	return err
}

// LocalPath returns the stored local path for a given source URL, or empty
// string if the entry is not ready yet.
func (m *Media) LocalPath(ctx context.Context, sourceURL string) (string, error) {
	var path string
	var status MediaStatus
	err := m.db.QueryRowContext(ctx, `
		SELECT local_path, status FROM media_cache WHERE source_url = ?
	`, sourceURL).Scan(&path, &status)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if status != MediaReady {
		return "", nil
	}
	return path, nil
}
