# CLAUDE.md — edge

サイネージ端末上で動く Go 製ローカルキャッシュサーバー。上流 `api`（クラウド）から記事・ランキング・画像を pull し、SQLite とローカルファイルにキャッシュして signage（ブラウザ）に返す。

---

## アーキテクチャ

```
api (クラウド)
  │  HTTPS (POLL_INTERVAL_MIN 間隔)
  ▼
edge (127.0.0.1:8080)   ← GET /api/feed/articles
  │                         GET /api/access/rankings
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
internal/server/feed.go          GET /api/feed/articles ハンドラ
internal/server/access.go        GET /api/access/rankings ハンドラ
internal/store/schema.go         SQLite open・スキーマ初期化（WAL モード）
internal/store/articles.go       articles テーブル操作（Upsert / List / ListReady）
internal/store/rankings.go       rankings テーブル操作（Replace / List / ListReady）
internal/store/media.go          media_cache テーブル操作（Enqueue / MarkReady / MarkFailed）
internal/sync/client.go          upstream HTTP クライアント（getJSON）
internal/sync/feed.go            FeedSyncer（記事 pull → articles upsert → 画像 enqueue）
internal/sync/access.go          AccessSyncer（ランキング pull → rankings replace → 画像 enqueue）
internal/sync/media.go           MediaSyncer（画像ダウンロード・4 並列ワーカー）
```

---

## SQLite スキーマ

```sql
articles     (id PK, title, image_url, description, start, fetched_at)
rankings     (id PK, title, image_url, rank, start, fetched_at)
media_cache  (source_url PK, local_path, status, retries, downloaded_at)
```

`media_cache.status` は `pending` / `ready` / `failed` の 3 値。

---

## 起動フロー

1. `config.Load()` で環境変数を読み込む（`.env` を自動 load）
2. SQLite open・スキーマ初期化（WAL モード、`busy_timeout=5000ms`、`MaxOpenConns=1`）
3. `media/` ディレクトリを作成
4. goroutine 3 本を起動:
   - `MediaSyncer.Run` — pending/failed 画像をダウンロード（ticker 30 秒 + 即時 trigger チャネル）
   - `FeedSyncer.Run` — 起動直後に 1 回 fetch、以後 `POLL_INTERVAL_MIN` 間隔
   - `AccessSyncer.Run` — 同上
5. HTTP サーバー起動（chi + CORS ミドルウェア）
6. SIGINT / SIGTERM で graceful shutdown（5 秒タイムアウト）

---

## 画像ダウンロード（MediaSyncer）

- 画像は **upstream の `/api/media/proxy?url=<encoded>` 経由**で取得する（外部 URL に直接アクセスしない）
- 保存パス: `<MEDIA_DIR>/<sha256[0:2]>/<sha256[2:4]>/<sha256>.<ext>`
  - `ext` は URL のパス拡張子優先、なければ `Content-Type` から決定、それもなければ `.bin`
- 書き込みは `.tmp` → rename のアトミック操作
- 最大リトライ回数: 3（`MediaFailed` 状態で retries < 3 なら再試行）
- 並列ワーカー数: 4

---

## signage へのレスポンス

`GET /api/feed/articles` および `GET /api/access/rankings` は **`media_cache.status = 'ready'` な記事・ランキングのみ** を返す（`ListReady` クエリ）。

`imageUrl` フィールドは `joinMediaURL(MEDIA_URL_PREFIX, local_path)` で構築する:
```
MEDIA_URL_PREFIX（例: file:///opt/signage/media）+ "/" + local_path（例: ab/cd/<sha>.jpg）
```

`MEDIA_URL_PREFIX` 未設定時は実行ファイルディレクトリ配下の `media/` を `file://` URL に変換して使用する。

---

## エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/health` | ヘルスチェック (`{"status":"ok"}`) |
| GET | `/api/feed/articles` | キャッシュ済み記事一覧（ready のみ） |
| GET | `/api/access/rankings` | キャッシュ済みランキング（ready のみ） |
| GET | `/poc/echo` | リクエストヘッダのエコーバック（PoC 用） |

CORS: `Access-Control-Allow-Origin: *`（`file://` からの fetch を許可するため）

---

## 環境変数

| 変数名 | 既定値 | 説明 |
|-------|--------|------|
| `UPSTREAM_API_URL` | (必須) | 上流 api のベース URL |
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
