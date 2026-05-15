package store

import (
	"context"
	"database/sql"
	"time"
)

// Playlist represents an edge-side row in the playlists table. is_active and
// play_count are driven by signage's POST /api/signage/playback reports; they
// have no upstream counterpart.
type Playlist struct {
	ID         string
	IsActive   bool
	PlayCount  int
	FetchedAt  time.Time
	ReportedAt *time.Time
}

type Playlists struct {
	db *sql.DB
}

func NewPlaylists(db *sql.DB) *Playlists {
	return &Playlists{db: db}
}

// Upsert inserts or refreshes the playlist row's fetched_at while preserving
// the runtime fields (is_active / play_count / reported_at) for existing rows.
func (p *Playlists) Upsert(ctx context.Context, id string, fetchedAt time.Time) error {
	_, err := p.db.ExecContext(ctx, `
		INSERT INTO playlists (id, is_active, play_count, fetched_at, reported_at)
		VALUES (?, 0, 0, ?, NULL)
		ON CONFLICT(id) DO UPDATE SET fetched_at = excluded.fetched_at
	`, id, fetchedAt)
	return err
}

// MarkActive sets is_active=1 for the given id and 0 for all others, and
// updates reported_at for the active row only. Returns sql.ErrNoRows when the
// row does not exist (caller should treat this as a 404 / unknown playlist).
func (p *Playlists) MarkActive(ctx context.Context, id string, reportedAt time.Time) error {
	tx, err := p.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var exists int
	err = tx.QueryRowContext(ctx, `SELECT 1 FROM playlists WHERE id = ?`, id).Scan(&exists)
	if err != nil {
		return err
	}

	if _, err := tx.ExecContext(ctx, `UPDATE playlists SET is_active = 0 WHERE id != ?`, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE playlists SET is_active = 1, reported_at = ? WHERE id = ?
	`, reportedAt, id); err != nil {
		return err
	}

	return tx.Commit()
}

// IncrementPlayCount bumps play_count for the given id. Silently no-ops if the
// row does not exist.
func (p *Playlists) IncrementPlayCount(ctx context.Context, id string) error {
	_, err := p.db.ExecContext(ctx, `
		UPDATE playlists SET play_count = play_count + 1 WHERE id = ?
	`, id)
	return err
}

// Cleanup deletes inactive playlists that are not the latest fetched one,
// along with their playlist_items. Returns the number of playlist rows
// removed. The invariant after Cleanup is: the table holds at most one active
// row plus at most one latest-fetched row (those may be the same row).
func (p *Playlists) Cleanup(ctx context.Context) (int, error) {
	tx, err := p.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	rows, err := tx.QueryContext(ctx, `
		SELECT id FROM playlists
		WHERE is_active = 0
		  AND id NOT IN (SELECT id FROM playlists ORDER BY fetched_at DESC LIMIT 1)
	`)
	if err != nil {
		return 0, err
	}
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return 0, err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}

	for _, id := range ids {
		if _, err := tx.ExecContext(ctx, `DELETE FROM playlist_items WHERE playlist_id = ?`, id); err != nil {
			return 0, err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM playlists WHERE id = ?`, id); err != nil {
			return 0, err
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return len(ids), nil
}

// HasReported reports whether any playlist row has ever been confirmed by
// signage. Used by MediaSyncer.Sweep to suppress deletion until signage has
// reported at least once.
func (p *Playlists) HasReported(ctx context.Context) (bool, error) {
	var n int
	err := p.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM playlists WHERE reported_at IS NOT NULL
	`).Scan(&n)
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// Latest returns the most recently fetched playlist row, or sql.ErrNoRows if
// the table is empty. Used by the GET /api/signage/playlist handler to decide
// which playlist signage should consume next.
func (p *Playlists) Latest(ctx context.Context) (Playlist, error) {
	var pl Playlist
	var isActive int
	var reportedAt sql.NullTime
	err := p.db.QueryRowContext(ctx, `
		SELECT id, is_active, play_count, fetched_at, reported_at
		FROM playlists
		ORDER BY fetched_at DESC
		LIMIT 1
	`).Scan(&pl.ID, &isActive, &pl.PlayCount, &pl.FetchedAt, &reportedAt)
	if err != nil {
		return Playlist{}, err
	}
	pl.IsActive = isActive != 0
	if reportedAt.Valid {
		t := reportedAt.Time
		pl.ReportedAt = &t
	}
	return pl, nil
}

// List returns all playlist rows for debug / status display, ordered by
// fetched_at descending.
func (p *Playlists) List(ctx context.Context) ([]Playlist, error) {
	rows, err := p.db.QueryContext(ctx, `
		SELECT id, is_active, play_count, fetched_at, reported_at
		FROM playlists
		ORDER BY fetched_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Playlist
	for rows.Next() {
		var p Playlist
		var isActive int
		var reportedAt sql.NullTime
		if err := rows.Scan(&p.ID, &isActive, &p.PlayCount, &p.FetchedAt, &reportedAt); err != nil {
			return nil, err
		}
		p.IsActive = isActive != 0
		if reportedAt.Valid {
			t := reportedAt.Time
			p.ReportedAt = &t
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
