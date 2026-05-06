package store

import (
	"context"
	"database/sql"
	"time"

	"github.com/windyakin/numazu-keizai-signage/edge/internal/model"
)

type Rankings struct {
	db *sql.DB
}

func NewRankings(db *sql.DB) *Rankings {
	return &Rankings{db: db}
}

// Replace wipes existing rankings and inserts the new set in a single transaction.
func (r *Rankings) Replace(ctx context.Context, rankings []model.Ranking, fetchedAt time.Time) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `DELETE FROM rankings`); err != nil {
		return err
	}

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO rankings (id, title, storage_key, rank, start, fetched_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, rk := range rankings {
		if _, err := stmt.ExecContext(ctx, rk.ID, rk.Title, rk.ImageKey, rk.Rank, rk.Start, fetchedAt); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (r *Rankings) List(ctx context.Context) ([]model.Ranking, *time.Time, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, title, storage_key, rank, start, fetched_at
		FROM rankings
		ORDER BY rank ASC
	`)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	var out []model.Ranking
	var fetchedAt *time.Time
	for rows.Next() {
		var rk model.Ranking
		var fa time.Time
		if err := rows.Scan(&rk.ID, &rk.Title, &rk.ImageKey, &rk.Rank, &rk.Start, &fa); err != nil {
			return nil, nil, err
		}
		out = append(out, rk)
		if fetchedAt == nil {
			fetchedAt = &fa
		}
	}
	return out, fetchedAt, rows.Err()
}

// ListReady returns rankings whose image has been downloaded (media_cache.status='ready').
// The Ranking.ImageKey field is overloaded to carry the cached media's local_path
// (relative to MEDIA_DIR), so the caller can pass it straight to buildMediaURL.
func (r *Rankings) ListReady(ctx context.Context) ([]model.Ranking, *time.Time, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT r.id, r.title, m.local_path, r.rank, r.start, r.fetched_at
		FROM rankings r
		JOIN media_cache m ON m.storage_key = r.storage_key
		WHERE m.status = 'ready'
		ORDER BY r.rank ASC
	`)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	var out []model.Ranking
	var fetchedAt *time.Time
	for rows.Next() {
		var rk model.Ranking
		var fa time.Time
		var localPath string
		if err := rows.Scan(&rk.ID, &rk.Title, &localPath, &rk.Rank, &rk.Start, &fa); err != nil {
			return nil, nil, err
		}
		rk.ImageKey = &localPath
		out = append(out, rk)
		if fetchedAt == nil {
			fetchedAt = &fa
		}
	}
	return out, fetchedAt, rows.Err()
}
