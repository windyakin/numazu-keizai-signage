package store

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"github.com/windyakin/numazu-keizai-signage/edge/internal/model"
)

// 上流 api `/api/signage/articles` の最新件数と揃える。signage への返却件数も
// この上限で揃えてランキング由来の古い記事が混入しないようにする。
const articleListLimit = 15

type Articles struct {
	db *sql.DB
}

func NewArticles(db *sql.DB) *Articles {
	return &Articles{db: db}
}

// Sync upserts the supplied set and deletes rows whose id is not present.
// Empty input is treated as a no-op to defend against transient upstream
// failures wiping the entire cache. Returns the number of rows deleted.
func (a *Articles) Sync(ctx context.Context, articles []model.Article, fetchedAt time.Time) (int, error) {
	if len(articles) == 0 {
		return 0, nil
	}

	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	upsert, err := tx.PrepareContext(ctx, `
		INSERT INTO articles (id, title, storage_key, qr_key, description, start, fetched_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			title = excluded.title,
			storage_key = excluded.storage_key,
			qr_key = excluded.qr_key,
			description = excluded.description,
			start = excluded.start,
			fetched_at = excluded.fetched_at
	`)
	if err != nil {
		return 0, err
	}
	defer upsert.Close()

	ids := make([]any, 0, len(articles))
	for _, ar := range articles {
		if _, err := upsert.ExecContext(ctx, ar.ID, ar.Title, ar.ImageKey, ar.QRKey, ar.Description, ar.Start, fetchedAt); err != nil {
			return 0, err
		}
		ids = append(ids, ar.ID)
	}

	placeholders := strings.TrimRight(strings.Repeat("?,", len(ids)), ",")
	res, err := tx.ExecContext(ctx, `DELETE FROM articles WHERE id NOT IN (`+placeholders+`)`, ids...)
	if err != nil {
		return 0, err
	}
	removed, err := res.RowsAffected()
	if err != nil {
		return 0, err
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return int(removed), nil
}

func (a *Articles) List(ctx context.Context) ([]model.Article, error) {
	rows, err := a.db.QueryContext(ctx, `
		SELECT id, title, storage_key, description, start
		FROM articles
		ORDER BY start DESC
		LIMIT ?
	`, articleListLimit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []model.Article
	for rows.Next() {
		var a model.Article
		if err := rows.Scan(&a.ID, &a.Title, &a.ImageKey, &a.Description, &a.Start); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// ListReady returns articles whose image has been downloaded (media_cache.status='ready').
// The Article.ImageKey / QRKey fields are overloaded to carry each cached media's
// local_path (relative to MEDIA_DIR), so the caller can pass them straight to
// buildMediaURL. The QR code is optional: a LEFT JOIN keeps the article visible even
// when its QR has not been cached yet, in which case QRKey stays nil.
func (a *Articles) ListReady(ctx context.Context) ([]model.Article, error) {
	rows, err := a.db.QueryContext(ctx, `
		SELECT a.id, a.title, m.local_path, mq.local_path, a.description, a.start
		FROM articles a
		JOIN media_cache m ON m.storage_key = a.storage_key
		LEFT JOIN media_cache mq ON mq.storage_key = a.qr_key AND mq.status = 'ready'
		WHERE m.status = 'ready'
		ORDER BY a.start DESC
		LIMIT ?
	`, articleListLimit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []model.Article
	for rows.Next() {
		var ar model.Article
		var localPath string
		var qrLocalPath sql.NullString
		if err := rows.Scan(&ar.ID, &ar.Title, &localPath, &qrLocalPath, &ar.Description, &ar.Start); err != nil {
			return nil, err
		}
		ar.ImageKey = &localPath
		if qrLocalPath.Valid && qrLocalPath.String != "" {
			qp := qrLocalPath.String
			ar.QRKey = &qp
		}
		out = append(out, ar)
	}
	return out, rows.Err()
}
