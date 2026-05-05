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
	StorageKey   string
	LocalPath    string
	MimeType     string
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

// Enqueue inserts a pending entry if the storage key is not yet tracked.
// Existing entries (ready / failed / pending) are left untouched.
// mimeType is optional; pass "" when the upstream did not provide one. It is
// only used as a fallback when picking a local file extension for keys that
// lack one.
func (m *Media) Enqueue(ctx context.Context, storageKey, mimeType string) error {
	_, err := m.db.ExecContext(ctx, `
		INSERT INTO media_cache (storage_key, local_path, mime_type, status, retries)
		VALUES (?, '', ?, ?, 0)
		ON CONFLICT(storage_key) DO NOTHING
	`, storageKey, mimeType, MediaPending)
	return err
}

// ListDownloadable returns entries that need to be (re)downloaded:
// pending, or failed with retries < maxRetries.
func (m *Media) ListDownloadable(ctx context.Context, maxRetries int) ([]MediaEntry, error) {
	rows, err := m.db.QueryContext(ctx, `
		SELECT storage_key, local_path, mime_type, status, retries
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
		if err := rows.Scan(&e.StorageKey, &e.LocalPath, &e.MimeType, &e.Status, &e.Retries); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (m *Media) MarkReady(ctx context.Context, storageKey, localPath string, at time.Time) error {
	_, err := m.db.ExecContext(ctx, `
		UPDATE media_cache
		SET local_path = ?, status = ?, downloaded_at = ?
		WHERE storage_key = ?
	`, localPath, MediaReady, at, storageKey)
	return err
}

func (m *Media) MarkFailed(ctx context.Context, storageKey string) error {
	_, err := m.db.ExecContext(ctx, `
		UPDATE media_cache
		SET status = ?, retries = retries + 1
		WHERE storage_key = ?
	`, MediaFailed, storageKey)
	return err
}

// LocalPath returns the stored local path for a given storage key, or empty
// string if the entry is not ready yet.
func (m *Media) LocalPath(ctx context.Context, storageKey string) (string, error) {
	var path string
	var status MediaStatus
	err := m.db.QueryRowContext(ctx, `
		SELECT local_path, status FROM media_cache WHERE storage_key = ?
	`, storageKey).Scan(&path, &status)
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

// ListOrphans returns media_cache rows whose storage_key is not referenced by
// any of articles / rankings / playlist_items. The caller is expected to delete
// the local file for each entry (when LocalPath != "") and then call Delete.
func (m *Media) ListOrphans(ctx context.Context) ([]MediaEntry, error) {
	rows, err := m.db.QueryContext(ctx, `
		SELECT storage_key, local_path, mime_type, status, retries
		FROM media_cache
		WHERE storage_key NOT IN (
			SELECT storage_key FROM articles       WHERE storage_key IS NOT NULL AND storage_key != ''
			UNION
			SELECT storage_key FROM rankings       WHERE storage_key IS NOT NULL AND storage_key != ''
			UNION
			SELECT storage_key FROM playlist_items WHERE storage_key IS NOT NULL AND storage_key != ''
		)
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []MediaEntry
	for rows.Next() {
		var e MediaEntry
		if err := rows.Scan(&e.StorageKey, &e.LocalPath, &e.MimeType, &e.Status, &e.Retries); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (m *Media) Delete(ctx context.Context, storageKey string) error {
	_, err := m.db.ExecContext(ctx, `DELETE FROM media_cache WHERE storage_key = ?`, storageKey)
	return err
}
