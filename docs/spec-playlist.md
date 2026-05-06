# サイネージ プレイリスト設定機能 仕様書

## 概要

管理者が admin 画面からサイネージの表示コンテンツ・順序を自由に設定できるプレイリスト機能を追加する。
既存のハードコードされた「記事 → ランキング」ループを廃止し、DB 管理のプレイリストに切り替える。

---

## 1. スライド種別定義

| 種別 | 表示内容 | 尺 | 補足 |
|------|---------|-----|------|
| `ARTICLE_LATEST` | 最新記事1件（`start` 降順1位） | 設定値（秒） | API 側で解決 |
| `ARTICLE_RANDOM` | ランダム記事1件 | 設定値（秒） | signage 側がプールから毎回ランダム選択 |
| `RANKING` | アクセスランキング Top5 | 設定値（秒） | |
| `IMAGE` | アップロード画像 | 設定値（秒） | `MediaFile` を参照 |
| `VIDEO` | アップロード動画 | 自然終了まで | `MediaFile` を参照。`durationSec = null` |

### ARTICLE_RANDOM の挙動

- signage が保持している記事プール（最新15件）から毎回ランダム選択する
- API はランダム解決を行わず、プールを返す責務のみ持つ
- プレイリストをループするたびに異なる記事が選ばれる

---

## 2. データモデル

### 2.1 Prisma スキーマ追加 (`api/prisma/schema.prisma`)

```prisma
enum PlaylistItemType {
  ARTICLE_LATEST
  ARTICLE_RANDOM
  RANKING
  IMAGE
  VIDEO
}

enum MediaFileType {
  IMAGE
  VIDEO
}

model MediaFile {
  id           String          @id @default(cuid())
  storageKey   String          @unique   // オブジェクトストレージのキー (例: "uploads/cuid.jpg")
  mimeType     String                    // "image/jpeg", "video/mp4" など
  type         MediaFileType
  originalName String                    // アップロード元ファイル名
  sizeBytes    BigInt?
  uploadedAt   DateTime        @default(now())
  playlistItems PlaylistItem[]
}

model PlaylistItem {
  id          String           @id @default(cuid())
  type        PlaylistItemType
  order       Int                        // 1始まり。小さいほど先に表示
  durationSec Int?                       // VIDEO は null（自然終了）
  mediaFileId String?                    // IMAGE / VIDEO のみ
  mediaFile   MediaFile?       @relation(fields: [mediaFileId], references: [id])
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt

  @@index([order])
}
```

**設計上の判断:**
- プレイリストは現状1本のみ（`Playlist` エンティティなし）。複数プレイリスト対応が必要になれば `playlistId` を後から追加する。
- `order` は `@@unique` にしない（ドラッグ&ドロップ更新時の一時的重複を API 側で吸収）。

---

## 3. API エンドポイント仕様

### 3.1 Signage 向け (`/api/signage/`)

#### `GET /api/signage/playlist`

プレイリスト一覧と記事プールを返す。

**レスポンス:**

```json
{
  "items": [
    {
      "id": "clxxx1",
      "type": "ARTICLE_LATEST",
      "order": 1,
      "durationSec": 8,
      "payload": {
        "id": "2382",
        "title": "沼津の...",
        "imageUrl": "https://example.com/img.jpg",
        "description": "...",
        "start": "2026-04-01T07:32:34Z"
      }
    },
    {
      "id": "clxxx2",
      "type": "ARTICLE_RANDOM",
      "order": 2,
      "durationSec": 8,
      "payload": null
    },
    {
      "id": "clxxx3",
      "type": "RANKING",
      "order": 3,
      "durationSec": 16,
      "payload": {
        "rankings": [ { "id": "2100", "title": "...", "imageUrl": "...", "rank": 1, "start": "..." } ],
        "fetchedAt": "2026-05-01T09:00:00Z"
      }
    },
    {
      "id": "clxxx4",
      "type": "IMAGE",
      "order": 4,
      "durationSec": 10,
      "payload": {
        "mediaFileId": "cuid",
        "url": "https://cdn.example.com/uploads/cuid.jpg",
        "mimeType": "image/jpeg"
      }
    },
    {
      "id": "clxxx5",
      "type": "VIDEO",
      "order": 5,
      "durationSec": null,
      "payload": {
        "mediaFileId": "cuid",
        "url": "https://cdn.example.com/uploads/cuid.mp4",
        "mimeType": "video/mp4"
      }
    }
  ],
  "articlePool": [
    { "id": "2382", "title": "...", "imageUrl": "...", "description": "...", "start": "..." }
  ]
}
```

**ハンドラロジック:**

1. `PlaylistItem` を `order` 昇順で全件取得（`mediaFile` include）
2. `ARTICLE_LATEST` アイテムが存在 → `Article` を `start DESC LIMIT 1` で取得して payload に埋め込む
3. `RANKING` アイテムが存在 → `AccessRanking` を全件取得して payload に埋め込む
4. `IMAGE`/`VIDEO` → `MediaFile.storageKey` から公開 URL を生成して payload に埋め込む
5. `ARTICLE_RANDOM` → payload は null。代わりに `articlePool`（最新15件）を返す
6. `ARTICLE_RANDOM` payload が null のとき、signage は `articlePool` からランダム選択する

---

### 3.2 Admin 向け (`/api/admin/`)

#### プレイリスト管理

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/admin/playlist` | プレイリスト全アイテム取得 |
| POST | `/api/admin/playlist` | アイテム追加（末尾に追加） |
| PATCH | `/api/admin/playlist/:id` | アイテム更新（`durationSec` のみ変更可） |
| DELETE | `/api/admin/playlist/:id` | アイテム削除 |
| PUT | `/api/admin/playlist/reorder` | 並び替え（ID 配列の順序で `order` を一括更新） |

**POST リクエスト型:**

```typescript
// discriminatedUnion
| { type: 'ARTICLE_LATEST'; durationSec: number }
| { type: 'ARTICLE_RANDOM'; durationSec: number }
| { type: 'RANKING';        durationSec: number }
| { type: 'IMAGE';          durationSec: number; mediaFileId: string }
| { type: 'VIDEO';          durationSec?: null;  mediaFileId: string }
```

**PUT reorder リクエスト:**

```json
{ "ids": ["clxxx3", "clxxx1", "clxxx2"] }
```
`ids[0]` が order=1 として一括更新。

---

#### メディアファイル管理

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/admin/media` | アップロード済みメディア一覧 |
| POST | `/api/admin/media/upload` | ファイルアップロード（multipart/form-data） |
| DELETE | `/api/admin/media/:id` | メタデータ削除＋オブジェクトストレージから削除 |

> **注**: RustFS が `PutBucketCors` 未実装のため、Presigned URL 直接アップロードではなく API 経由のマルチパートアップロードを採用。`file`（ファイル実体）と `type`（`"IMAGE"` or `"VIDEO"`）を form-data で送信する。

**GET `/api/admin/media` レスポンス:**

```json
{
  "files": [
    {
      "id": "cuid",
      "storageKey": "uploads/cuid.jpg",
      "url": "https://cdn.example.com/uploads/cuid.jpg",
      "mimeType": "image/jpeg",
      "type": "IMAGE",
      "originalName": "banner.jpg",
      "sizeBytes": "204800",
      "uploadedAt": "2026-05-01T10:00:00Z"
    }
  ]
}
```

**POST `/api/admin/media/upload` リクエスト（multipart/form-data）:**

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `file` | File | 画像または動画ファイル |
| `type` | string | `"IMAGE"` または `"VIDEO"` |

---

## 4. ファイルストレージ仕様

### 4.1 アーキテクチャ

外部オブジェクトストレージ（S3 互換）を使用。ローカル開発環境では RustFS を使う。

```
admin (browser)
  │  POST /api/admin/media/upload-url  { mimeType, originalName, type }
  ▼
api (Hono)
  │  S3 SDK で PutObject の Presigned URL 生成
  │  storageKey = "uploads/{cuid()}.{ext}"
  │  返す: { presignedUrl, storageKey }
  ▼
admin (browser)
  │  PUT {presignedUrl}  (body = ファイル実体)
  ▼
admin (browser)
  │  POST /api/admin/media  { storageKey, mimeType, ... }
  ▼
api (Hono)
     MediaFile レコードを DB に作成・返す
```

### 4.2 ストレージクライアント実装

新規ファイル: `api/src/storage.ts`

```typescript
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

export function createStorageClient(): S3Client {
  return new S3Client({
    region: process.env.STORAGE_REGION || "auto",
    endpoint: process.env.STORAGE_ENDPOINT,           // RustFS: "http://rustfs:9000"
    forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY_ID!,
      secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY!,
    },
  })
}

export async function generateUploadUrl(
  client: S3Client, bucket: string, storageKey: string, mimeType: string, expiresIn = 300
): Promise<string> {
  return getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: storageKey, ContentType: mimeType }), { expiresIn })
}

// 公開バケット前提の URL 生成
export function getPublicUrl(storageKey: string): string {
  const base = process.env.STORAGE_PUBLIC_BASE_URL!
  return `${base.replace(/\/$/, "")}/${storageKey}`
}

export async function deleteObject(client: S3Client, bucket: string, storageKey: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }))
}
```

### 4.3 docker-compose への RustFS 追加

```yaml
rustfs:
  image: rustfs/rustfs:latest
  environment:
    RUSTFS_ACCESS_KEY: rustfsadmin
    RUSTFS_SECRET_KEY: rustfsadmin
  ports:
    - "9000:9000"   # S3 API
  volumes:
    - rustfs_data:/data
```

初期バケット作成は `aws` CLI / `rclone` 等で実行するか Makefile コマンドを用意する。
RustFS の CORS 設定で `PUT` メソッドを許可すること（Presigned URL 直接アップロードに必要）。

### 4.4 環境変数（api）

```
STORAGE_ENDPOINT=http://rustfs:9000         # RustFS(ローカル) / 省略でAWS S3
STORAGE_REGION=ap-northeast-1
STORAGE_BUCKET=signage-media
STORAGE_ACCESS_KEY_ID=rustfsadmin
STORAGE_SECRET_ACCESS_KEY=rustfsadmin
STORAGE_PUBLIC_BASE_URL=http://localhost:9000/signage-media
STORAGE_FORCE_PATH_STYLE=true               # パス形式 URL 必須
```

---

## 5. signage 表示仕様

### 5.1 プレイリスト取得フロー

1. 起動時に `GET /api/signage/playlist` を取得
2. 一定間隔（`VITE_PLAYLIST_REFRESH_INTERVAL_MIN` デフォルト 30分）で再取得
3. 再取得のタイミングで `ARTICLE_RANDOM` の選択も更新される

### 5.2 スライド制御ロジック（`SlideArea.vue`）

```
起動 → fetchPlaylist() → currentIndex = 0
  → 現在アイテムを表示
  → VIDEO 以外: durationSec 後に advanceSlide()
  → VIDEO: @ended イベントで advanceSlide()
  → currentIndex = (currentIndex + 1) % items.length
  → ループ末尾で再び currentIndex = 0 に戻る
  → 30分経過で fetchPlaylist() 再実行
```

**ARTICLE_RANDOM の選択タイミング:**
- `fetchPlaylist()` 実行時に `articlePool` を受け取る
- `ARTICLE_RANDOM` スライドを表示するたびに `articlePool` からランダム選択

**ハードコードロジックの廃止:**
- 既存の「記事を全件表示 → ランキング → ループ」ロジックを削除
- `VITE_SLIDE_DURATION_SEC` / `VITE_RANKING_DURATION_SEC` 環境変数は deprecated（プレイリストの `durationSec` で管理）

### 5.3 新規スライドコンポーネント

#### `ImageSlide.vue`

- props: `item`（type === 'IMAGE'）
- `item.payload.url` を `<img>` で全画面表示
- `object-fit: cover`
- 既存 `NewsArticleSlide.vue` と同様のフェードアニメーション

#### `VideoSlide.vue`

- props: `item`（type === 'VIDEO'）
- emits: `video-ended`
- `<video autoplay muted playsinline>` で全画面表示
- `@ended` → `emit('video-ended')`
- `object-fit: cover`
- `durationSec` が null でない場合は `setTimeout` でフォールバック（動画読み込み失敗対策）

### 5.4 API クライアント追加

新規ファイル: `signage/src/api/playlist.ts`

```typescript
export type PlaylistItemType = 'ARTICLE_LATEST' | 'ARTICLE_RANDOM' | 'RANKING' | 'IMAGE' | 'VIDEO'

export interface ArticlePayload {
  id: string; title: string; imageUrl: string; description: string | null; start: string
}
export interface RankingPayload {
  rankings: Array<{ id: string; title: string; imageUrl: string; rank: number; start: string }>
  fetchedAt: string | null
}
export interface MediaPayload {
  mediaFileId: string; url: string; mimeType: string
}

export interface PlaylistItem {
  id: string; type: PlaylistItemType; order: number; durationSec: number | null
  payload: ArticlePayload | RankingPayload | MediaPayload | null
}

export interface PlaylistResponse {
  items: PlaylistItem[]
  articlePool: ArticlePayload[]
}

export async function fetchPlaylist(): Promise<PlaylistResponse> {
  const res = await fetch(`${BASE_URL}/signage/playlist`)
  if (!res.ok) throw new Error(`Failed to fetch playlist: ${res.status}`)
  return res.json()
}
```

### 5.5 環境変数（signage）

```
VITE_API_BASE_URL=http://127.0.0.1:8080/api    # edge ローカルサーバー
VITE_PLAYLIST_REFRESH_INTERVAL_MIN=30
```

---

## 6. Admin UI 仕様

### 6.1 画面構成

| パス | View | 説明 |
|------|------|------|
| `/` | `HomeView.vue` | ダッシュボード（各画面へのリンク） |
| `/playlist` | `PlaylistView.vue` | プレイリスト管理（メイン） |
| `/media` | `MediaView.vue` | メディアファイル管理 |

### 6.2 PlaylistView.vue

**コンポーネント構成:**

```
PlaylistView.vue
├── PlaylistOrderList.vue          # ドラッグ&ドロップ並び替え + 表示
│   └── PlaylistItemRow.vue        # 1行: 種別バッジ / 尺 / メディア名 / 削除ボタン
└── AddPlaylistItemDialog.vue      # アイテム追加ダイアログ
    └── MediaFilePicker.vue        # 画像/動画ファイル選択コンポーネント
```

**使用 PrimeVue コンポーネント:**

| コンポーネント | 用途 |
|--------------|------|
| `OrderList` | ドラッグ&ドロップ並び替え |
| `Button` | 追加・削除・保存 |
| `Dialog` | アイテム追加ダイアログ |
| `Select` | スライド種別選択 |
| `InputNumber` | 表示秒数入力 |
| `Tag` | 種別バッジ（LATEST / RANDOM / RANKING / IMAGE / VIDEO） |
| `DataTable` | MediaFilePicker 内の選択テーブル |

**AddPlaylistItemDialog の入力フロー:**

1. `Select` で種別を選択
2. 入力項目を種別で切り替え:
   - `ARTICLE_LATEST` / `ARTICLE_RANDOM` / `RANKING`: `InputNumber`（秒数）のみ
   - `IMAGE`: `InputNumber`（秒数）+ `MediaFilePicker`（IMAGE フィルター）
   - `VIDEO`: 「自然終了」固定表示 + `MediaFilePicker`（VIDEO フィルター）
3. 確定 → `POST /api/admin/playlist`

**並び替え保存フロー:**

1. `OrderList` のドラッグ操作でアイテム順を変更
2. 「保存」ボタン押下 → `PUT /api/admin/playlist/reorder { ids: [...] }`

### 6.3 MediaView.vue

**コンポーネント構成:**

```
MediaView.vue
├── MediaFileTable.vue    # アップロード済みメディア一覧 (DataTable + サムネイル)
└── MediaUploadDialog.vue # ファイルアップロードダイアログ
```

**使用 PrimeVue コンポーネント:**

| コンポーネント | 用途 |
|--------------|------|
| `DataTable` | メディア一覧（サムネイル / ファイル名 / サイズ / 種別 / 日時） |
| `FileUpload` | ファイル選択・アップロード実行（`customUpload` モード） |
| `Image` | サムネイルプレビュー |
| `Button` | アップロード・削除 |
| `ConfirmDialog` + `useConfirm` | 削除確認 |
| `Toast` + `useToast` | 操作結果通知 |

**アップロードフロー（`FileUpload` の `customUpload` モード）:**

```typescript
async function handleUpload(event: FileUploadUploaderEvent) {
  const file = event.files[0]
  // 1. Presigned URL 取得
  const { presignedUrl, storageKey } = await apiFetch('/media/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mimeType: file.type, originalName: file.name, type: detectType(file.type) }),
  })
  // 2. オブジェクトストレージに直接 PUT
  await fetch(presignedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
  // 3. メタデータ登録
  await apiFetch('/media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storageKey, mimeType: file.type, originalName: file.name, type: detectType(file.type), sizeBytes: file.size }),
  })
}
```

### 6.4 Pinia ストア

`admin/src/stores/usePlaylistStore.ts`

```typescript
// state
const items = ref<AdminPlaylistItem[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

// actions
fetchPlaylist()       // GET /api/admin/playlist
addItem(body)         // POST /api/admin/playlist
updateItem(id, patch) // PATCH /api/admin/playlist/:id
removeItem(id)        // DELETE /api/admin/playlist/:id
reorder(ids)          // PUT /api/admin/playlist/reorder
```

`admin/src/stores/useMediaStore.ts`

```typescript
const files = ref<AdminMediaFile[]>([])
fetchMedia()            // GET /api/admin/media
getUploadUrl(params)    // POST /api/admin/media/upload-url
registerMedia(params)   // POST /api/admin/media
removeMedia(id)         // DELETE /api/admin/media/:id
```

### 6.5 Admin API クライアント追加ファイル

- `admin/src/api/playlist.ts` — プレイリスト CRUD
- `admin/src/api/media.ts` — メディアファイル管理

**注意:** `apiFetch` を呼ぶ際は `headers: { 'Content-Type': 'application/json' }` を明示すること（現在の `apiFetch` は自動付与しない）。

---

## 7. edge 対応

### 7.1 追加するストア

```sql
-- SQLite スキーマ追加
playlist_items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,           -- PlaylistItemType の文字列値
  item_order INTEGER NOT NULL,
  duration_sec INTEGER,         -- NULL = 自然終了（VIDEO）
  media_file_id TEXT,           -- media_files.id への参照
  fetched_at INTEGER NOT NULL   -- Unix 秒
)

media_files (
  id TEXT PRIMARY KEY,
  storage_url TEXT NOT NULL,    -- オブジェクトストレージの公開 URL
  local_path TEXT,              -- ダウンロード済みローカルパス（NULL = 未ダウンロード）
  mime_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending / ready / failed
  retries INTEGER NOT NULL DEFAULT 0,
  downloaded_at INTEGER         -- Unix 秒
)
```

### 7.2 追加するパッケージ構成

```
internal/model/playlist.go      PlaylistItem / PlaylistResponse 型
internal/store/playlist.go      playlist_items テーブル操作 (Replace / List)
internal/store/mediafiles.go    media_files テーブル操作 (Enqueue / MarkReady / MarkFailed)
internal/sync/playlist.go       PlaylistSyncer (api から pull → DB 保存 → メディア enqueue)
internal/server/playlist.go     GET /api/signage/playlist ハンドラ
```

### 7.3 PlaylistSyncer の動作

1. api の `GET /api/signage/playlist` を fetch
2. `playlist_items` を全削除 → 再 INSERT（Replace 方式）
3. `ARTICLE_RANDOM` の `articlePool` は DB には保存せず、リクエスト時に articles テーブルから取得
4. `IMAGE`/`VIDEO` アイテムの `payload.url` を `media_files` に enqueue（MediaSyncer に処理委譲）

### 7.4 edge の `/api/signage/playlist` ハンドラ

- `playlist_items` を `item_order` 昇順で全件取得
- `ARTICLE_LATEST`: `articles` テーブルから `start DESC LIMIT 1`
- `ARTICLE_RANDOM`: payload = null。`articlePool` = `articles` テーブルから最新15件（`ListReady(ctx, 15)`）
- `RANKING`: `rankings` テーブルから全件取得
- `IMAGE`/`VIDEO`: `media_files.status = 'ready'` のもののみ返す。未 ready のアイテムはスキップ（signage 側でスキップし次へ進む）
- `payload.url` は `joinMediaURL(MEDIA_URL_PREFIX, local_path)` で `file://` URL に変換

### 7.5 signage の IMAGE/VIDEO 対応における制約

- `IMAGE`/`VIDEO` スライドが `null` payload で返ってきた場合（メディア未 ready）、signage はそのアイテムをスキップして次へ進む
- edge のメディアダウンロードは既存の MediaSyncer と同じ `pending → ready / failed` パターンを踏襲

---

## 8. 環境変数まとめ

### api

```
# 既存
DATABASE_URL=...
FEED_URL=...
FEED_IMAGE_BASE_URL=...
FEED_FETCH_INTERVAL_MIN=30
ACCESS_URL=...
PORT=3000

# 新規追加
STORAGE_ENDPOINT=http://rustfs:9000
STORAGE_REGION=ap-northeast-1
STORAGE_BUCKET=signage-media
STORAGE_ACCESS_KEY_ID=rustfsadmin
STORAGE_SECRET_ACCESS_KEY=rustfsadmin
STORAGE_PUBLIC_BASE_URL=http://localhost:9000/signage-media
STORAGE_FORCE_PATH_STYLE=true
```

### signage

```
# 既存（deprecated になるが暫定残存）
VITE_API_BASE_URL=http://127.0.0.1:8080/api
VITE_SLIDE_DURATION_SEC=8      # deprecated
VITE_RANKING_DURATION_SEC=16   # deprecated

# 新規追加
VITE_PLAYLIST_REFRESH_INTERVAL_MIN=30
```

### admin

```
# 変更なし
VITE_API_BASE_URL=/api/admin
```

---

## 9. 実装ロードマップ（推奨順序）

### Phase 1: api バックエンド

1. `@aws-sdk/client-s3` / `@aws-sdk/s3-request-presigner` を `api/package.json` に追加
2. `schema.prisma` に `MediaFile` / `PlaylistItem` モデルを追加 → `prisma migrate dev`
3. `api/src/storage.ts` 作成
4. `admin.ts` にメディア管理エンドポイント追加（upload-url / register / list / delete）
5. `admin.ts` にプレイリスト管理エンドポイント追加（CRUD + reorder）
6. `signage.ts` に `GET /api/signage/playlist` 追加

### Phase 2: インフラ

7. `docker-compose.yml` に RustFS サービス追加
8. api サービスにストレージ環境変数追加
9. `Makefile` に RustFS バケット初期化コマンド追加

### Phase 3: admin フロントエンド

10. `src/api/playlist.ts` / `src/api/media.ts` 追加
11. `src/stores/usePlaylistStore.ts` / `src/stores/useMediaStore.ts` 追加
12. `MediaView.vue` 実装（アップロードフロー含む）
13. `PlaylistView.vue` 実装（ドラッグ&ドロップ並び替え含む）
14. `router/index.ts` + `HomeView.vue` 更新

### Phase 4: signage フロントエンド

15. `src/api/playlist.ts` 追加
16. `ImageSlide.vue` / `VideoSlide.vue` 追加
17. `SlideArea.vue` 書き換え（ハードコードロジック → プレイリスト駆動に変更）
18. 定期再取得ロジック追加

### Phase 5: edge

19. `model/playlist.go` 追加（型定義）
20. `store/schema.go` 更新（`playlist_items` / `media_files` テーブル追加）
21. `store/playlist.go` / `store/mediafiles.go` 追加
22. `sync/playlist.go` 追加（PlaylistSyncer）
23. `server/playlist.go` 追加（`GET /api/signage/playlist` ハンドラ）
24. `cmd/edge/main.go` 更新（PlaylistSyncer goroutine 追加）

---

## 10. 未解決事項・後フェーズ検討

- 動画の尺情報（`durationSec`）は現状アップロード時に admin が手動入力する前提。後フェーズでサーバー側自動解析（ffprobe 等）を検討。
- プレイリストが空の場合の signage 挙動（ローディング表示のまま待機 or フォールバック表示）
- 複数プレイリスト・スケジュール管理は後フェーズ（認証・スケジュール機能と同時設計）
