package store

import (
	"context"
	"database/sql"
	"time"

	"github.com/windyakin/numazu-keizai-signage/packages/edge/internal/model"
)

type Articles struct {
	db *sql.DB
}

func NewArticles(db *sql.DB) *Articles {
	return &Articles{db: db}
}

func (a *Articles) Upsert(ctx context.Context, article model.Article, fetchedAt time.Time) error {
	_, err := a.db.ExecContext(ctx, `
		INSERT INTO articles (id, title, image_url, description, start, fetched_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			title = excluded.title,
			image_url = excluded.image_url,
			description = excluded.description,
			start = excluded.start,
			fetched_at = excluded.fetched_at
	`, article.ID, article.Title, article.ImageURL, article.Description, article.Start, fetchedAt)
	return err
}

func (a *Articles) List(ctx context.Context) ([]model.Article, error) {
	rows, err := a.db.QueryContext(ctx, `
		SELECT id, title, image_url, description, start
		FROM articles
		ORDER BY start DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []model.Article
	for rows.Next() {
		var a model.Article
		if err := rows.Scan(&a.ID, &a.Title, &a.ImageURL, &a.Description, &a.Start); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// ListReady returns articles whose image has been downloaded (media_cache.status='ready').
// The Article.ImageURL field is replaced with the cached media's local_path.
func (a *Articles) ListReady(ctx context.Context) ([]model.Article, error) {
	rows, err := a.db.QueryContext(ctx, `
		SELECT a.id, a.title, m.local_path, a.description, a.start
		FROM articles a
		JOIN media_cache m ON m.source_url = a.image_url
		WHERE m.status = 'ready'
		ORDER BY a.start DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []model.Article
	for rows.Next() {
		var a model.Article
		if err := rows.Scan(&a.ID, &a.Title, &a.ImageURL, &a.Description, &a.Start); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}
