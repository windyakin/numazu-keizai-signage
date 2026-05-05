package store

import (
	"database/sql"
	"strings"

	_ "modernc.org/sqlite"
)

const schema = `
CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  storage_key TEXT,
  description TEXT,
  start DATETIME NOT NULL,
  fetched_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS rankings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  storage_key TEXT,
  rank INTEGER NOT NULL,
  start DATETIME NOT NULL,
  fetched_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS playlist_items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  item_order INTEGER NOT NULL,
  duration_sec INTEGER,
  storage_key TEXT,
  mime_type TEXT,
  is_fullscreen INTEGER NOT NULL DEFAULT 0,
  fetched_at DATETIME NOT NULL
);

-- 上流 api の MediaFile (S3 オブジェクト) ローカルキャッシュ。
-- articles / rankings / playlist_items 全てから参照される単一の物理メディア追跡テーブル。
CREATE TABLE IF NOT EXISTS media_cache (
  storage_key   TEXT PRIMARY KEY,
  local_path    TEXT NOT NULL DEFAULT '',
  mime_type     TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'pending',
  retries       INTEGER NOT NULL DEFAULT 0,
  downloaded_at DATETIME
);
`

func Open(dbPath string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", dbPath+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, err
	}
	if err := migrate(db); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

// migrate applies idempotent schema patches for pre-existing databases.
// Each statement may report "duplicate column" if already applied; that is ignored.
func migrate(db *sql.DB) error {
	stmts := []string{
		`ALTER TABLE playlist_items ADD COLUMN is_fullscreen INTEGER NOT NULL DEFAULT 0`,
	}
	for _, stmt := range stmts {
		if _, err := db.Exec(stmt); err != nil {
			if strings.Contains(err.Error(), "duplicate column") {
				continue
			}
			return err
		}
	}
	return nil
}
