# CLAUDE.md — edge

サイネージ端末上で動く Go 製ローカルキャッシュサーバー。上流 `api`（クラウド）から記事・ランキング・画像を pull し、SQLite とローカルファイルにキャッシュして signage（ブラウザ）に返す。

---

## アーキテクチャ

```
api (クラウド)
  │  HTTPS (POLL_INTERVAL_MIN 間隔)
  ▼
edge (127.0.0.1:8080)   ← GET /api/signage/articles
  │                         GET /api/signage/rankings
  ├── SQLite (edge.db)
  │     articles / rankings / media_cache
  └── media/              ← 画像実体
        <ab>/<cd>/<sha256>.<ext>
  │
  ▼  HTTP (CORS * 許可)
signage (file://)
```

signage は `file://` で開かれるため、画像を HTTP 配信せず **ローカルファイルパス（`file://` URL or 相対パス）** で直接参照する。そのため **signage dist ディレクトリと `media/` ディレクトリは同一親ディレクトリに配置する** こと。

```
/opt/signage/
├── index.html        ← signage dist
├── assets/
└── media/            ← edge が書き込む
    └── ab/cd/<sha256>.jpg
```

---

## パッケージ構成

```
cmd/edge/main.go                 エントリポイント。goroutine 起動・HTTP サーバー・graceful shutdown
internal/config/config.go        環境変数ロード。実行ファイルディレクトリ基準でデフォルトパス決定
internal/model/model.go          Article / Ranking / Response 型定義
internal/server/server.go        chi ルーター・CORS ミドルウェア
internal/server/articles.go      GET /api/signage/articles ハンドラ
internal/server/rankings.go      GET /api/signage/rankings ハンドラ
internal/server/playback.go      POST /api/signage/playback ハンドラ（signage 再生状況の受信）
internal/store/schema.go         SQLite open・スキーマ初期化（WAL モード）
internal/store/articles.go       articles テーブル操作（Sync / List / ListReady）。List 系は最新 15 件 cap
internal/store/rankings.go       rankings テーブル操作（Replace / List / ListReady）
internal/store/playlists.go      playlists テーブル操作（Upsert / MarkActive / IncrementPlayCount / Cleanup / HasReported / Latest / List）
internal/store/playlist.go       playlist_items テーブル操作（Replace(playlistId, ...) / List(playlistId)）
internal/store/media.go          media_cache テーブル操作（Enqueue / MarkReady / MarkFailed / LocalPath / ListOrphans / Delete）
internal/sync/client.go          upstream HTTP クライアント（getJSON）
internal/sync/articles.go        ArticlesSyncer（記事 pull → articles ID 差分同期 → メディア enqueue → media sweep）
internal/sync/rankings.go        RankingsSyncer（ランキング pull → rankings replace → メディア enqueue → media sweep）
internal/sync/playlist.go        PlaylistSyncer（プレイリスト pull → items replace → メディア enqueue → media sweep）
internal/sync/media.go           MediaSyncer（記事画像 / ランキング画像 / スライドメディアを単一プールでダウンロード・4 並列ワーカー、Sweep で孤児削除）
```

---

## SQLite スキーマ

```sql
articles       (id PK, title, storage_key, description, start, fetched_at)
rankings       (id PK, title, storage_key, rank, start, fetched_at)
playlists      (id PK, is_active, play_count, fetched_at, reported_at)
playlist_items (id PK, playlist_id FK, type, item_order, duration_sec, storage_key, mime_type, is_fullscreen, fetched_at)
media_cache    (storage_key PK, local_path, mime_type, status, retries, downloaded_at)
```

`storage_key` は上流 api が返す `MediaFile.storageKey`（例: `articles/2382.jpg` / `uploads/<uuid>.jpg`）。`media_cache` は記事画像・ランキング画像・スライドメディアの全てを単一テーブルで追跡し、`articles.storage_key` / `rankings.storage_key` / `playlist_items.storage_key` の各参照は `media_cache.storage_key` を指す。`media_cache.status` は `pending` / `ready` / `failed` の 3 値。

`playlists` は edge ローカルでの「signage が今どのプレイリストを再生中か」を追跡するためのテーブル（上流 api の `Playlist` モデルとは別物・同期しない）。`is_active` は signage の `POST /api/signage/playback` 報告で 1/0 が切り替わり、`play_count` は wrap-around を検知した signage が `looped=true` を送るたびに +1 される。`reported_at` は最後に signage 報告を受けた時刻で、`MediaSyncer.Sweep` は **どの行も `reported_at` が NULL の場合は実行しない**（signage 起動前の誤削除を防ぐ）。`playlists.Cleanup` は「`is_active=1`」と「最新 fetch」のいずれにも当てはまらない行を `playlist_items` ごと削除する。

---

## 起動フロー

1. `config.Load()` で環境変数を読み込む（`.env` を自動 load）
2. SQLite open・スキーマ初期化（WAL モード、`busy_timeout=5000ms`、`MaxOpenConns=1`）
3. `media/` ディレクトリを作成
4. goroutine 3 本を起動:
   - `MediaSyncer.Run` — pending/failed 画像をダウンロード（ticker 30 秒 + 即時 trigger チャネル）
   - `ArticlesSyncer.Run` — 起動直後に 1 回 fetch、以後 `POLL_INTERVAL_MIN` 間隔
   - `RankingsSyncer.Run` — 同上
5. HTTP サーバー起動（chi + CORS ミドルウェア）
6. SIGINT / SIGTERM で graceful shutdown（5 秒タイムアウト）

---

## 画像ダウンロード（MediaSyncer）

- 画像は **upstream の `/api/signage/media?key=<imageKey>` 経由**で取得する（外部 URL に直接アクセスしない）。`imageKey` は上流 api が `Article` / `Ranking` レスポンスで返す S3 オブジェクトキー（例: `articles/2382.jpg`）。
- 保存パス: `<MEDIA_DIR>/<sha256[0:2]>/<sha256[2:4]>/<sha256>.<ext>`（`sha256` は `imageKey` のハッシュ）
  - `ext` は `imageKey` のパス拡張子優先、なければ `Content-Type` から決定、それもなければ `.bin`
- 書き込みは `.tmp` → rename のアトミック操作
- 最大リトライ回数: 3（`MediaFailed` 状態で retries < 3 なら再試行）
- 並列ワーカー数: 4
- **Sweep（孤児削除）**: `MediaSyncer.Sweep` は articles / rankings / playlist_items のいずれからも参照されなくなった `media_cache` 行と `<MEDIA_DIR>/...` の実ファイルを削除する。各 syncer (articles / rankings / playlist) の `once()` 末尾で呼び出し、参照テーブルが更新された直後に共通でクリーンアップが走る形にしている。`playlist_items` は `playlists` テーブルに存在する複数の playlist 行（=最新 fetch + signage が再生中の旧 playlist）を横断して保持されるため、signage が新プレイリストにスワップして `POST /api/signage/playback` を送るまで旧プレイリスト固有のメディアは削除されない。さらに **signage がまだ一度も `POST /api/signage/playback` を送っていない場合 (`HasReported() == false`) は Sweep を no-op にして抑止する**。

## articles の同期（ArticlesSyncer）

- 上流 `/api/signage/articles` は最新 15 件を返す。`Articles.Sync` でトランザクション内に **upsert + 上流に存在しない id を削除** を実行し、ID 差分でローカル状態を上流とミラーさせる。
- `Articles.List` / `ListReady` 側にも `LIMIT 15` を入れ、移行中の旧 SQLite に残るランキング由来の古い記事が signage に漏れないようにしている。
- 上流が空応答 (`len == 0`) を返した場合は `Sync` が no-op として早期 return し、上流不調による全件消失を防ぐ。

---

## signage へのレスポンス

`GET /api/signage/articles` および `GET /api/signage/rankings` は **`media_cache.status = 'ready'` な記事・ランキングのみ** を返す（`ListReady` クエリ）。articles は `start DESC` で最新 15 件 cap。

レスポンスの `imageUrl` フィールドは `buildMediaURL(req, MEDIA_DIR, local_path)` で構築する:
- `Origin: file:` または `Origin: null` の場合: `file://<MEDIA_DIR>/<local_path>` を返す
- それ以外（http/https/curl 等）: `http(s)://<host>/media/<local_path>` を返す

signage 側の API クライアント型 (`signage/src/api/articles.ts`, `rankings.ts`) は `imageUrl: string` のままなので、edge の DTO フィールド名も `imageUrl` を維持する（中身はファイル URL に解決済み）。

---

## エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/health` | ヘルスチェック (`{"status":"ok"}`) |
| GET | `/api/signage/articles` | キャッシュ済み記事一覧（ready のみ） |
| GET | `/api/signage/rankings` | キャッシュ済みランキング（ready のみ） |
| GET | `/api/signage/playlist` | キャッシュ済みプレイリスト（最新 fetch を `{id, items}` で返す） |
| POST | `/api/signage/playback` | signage の現在再生状況を受信 (`{playlistId, currentItemId, looped}`)。`is_active` 切替・`play_count++`・古い playlist の解放を行う |
| POST | `/api/signage/refresh` | 上流 fetch を即時実行 |
| GET | `/media/*` | キャッシュ済み画像の HTTP 配信 |
| GET | `/poc/echo` | リクエストヘッダのエコーバック（PoC 用） |

CORS: `Access-Control-Allow-Origin: *`（`file://` からの fetch を許可するため）

---

## 環境変数

| 変数名 | 既定値 | 説明 |
|-------|--------|------|
| `UPSTREAM_API_URL` | (必須) | 上流 api のベース URL |
| `SIGNAGE_API_TOKEN` | (任意) | 上流 api 認証用の共有シークレット。設定時のみ全リクエストに `Authorization: Bearer ...` を付与（api 側と同値にする） |
| `POLL_INTERVAL_MIN` | `5` | 上流 pull 間隔（分） |
| `MEDIA_DIR` | `<exe dir>/media` | 画像保存先ディレクトリ |
| `DB_PATH` | `<exe dir>/edge.db` | SQLite ファイルパス |
| `LISTEN_ADDR` | `127.0.0.1:8080` | HTTP 待ち受けアドレス |
| `MEDIA_URL_PREFIX` | `file://<MEDIA_DIR>` | signage に返す imageUrl の prefix |

`go run` 実行時はテンポラリディレクトリ判定により CWD をベースディレクトリとして使用する。

---

## 開発コマンド

```sh
npm run dev    # go run ./cmd/edge
npm run build  # dist/edge バイナリ生成
npm run test   # go test ./...
npm run lint   # go vet ./...
```

---

## 依存ライブラリ

| ライブラリ | 用途 |
|-----------|------|
| `github.com/go-chi/chi/v5` | HTTP ルーター |
| `github.com/joho/godotenv` | `.env` ファイルロード |
| `modernc.org/sqlite` | Pure Go SQLite ドライバ（CGO 不要） |

---

## コーディング規約

- Go 標準の `log` パッケージでログ出力（構造化ロガー不使用）
- エラーレスポンスは `{"error":"..."}` で統一
- context はすべてのストア・HTTP 呼び出しに伝播させる
- goroutine はすべて `ctx.Done()` で終了させる
