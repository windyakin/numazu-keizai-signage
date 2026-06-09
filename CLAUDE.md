# CLAUDE.md — デジタルサイネージシステム（MVP）

## MVP のゴール

ニュースフィードから記事を取得し、サイネージ画面にスライド表示する。
管理画面・認証・スケジュール管理・ファイルアップロードは後フェーズ。

---

## リポジトリ構成（モノレポ）

```
/
├── api/            # Hono (Node.js + TypeScript)
├── signage/        # Vue 3 + Vite + TypeScript（サイネージ表示）
├── admin/          # Vue 3 + Vite + TypeScript + PrimeVue v4（管理画面）
├── docker-compose.yml
├── nginx/
│   └── nginx.conf
├── docs/
│   ├── feed-sample.json     # ← フィード構造の参照用サンプル。変更しないこと
│   └── access-sample.json   # ← アクセスランキング構造の参照用サンプル。変更しないこと
└── CLAUDE.md
```

---

## フィード JSON の構造

`docs/feed-sample.json` を参照すること。主要フィールドは以下のとおり。

```ts
type ArticleItem = {
  id: string
  title: string
  image: string    // ファイル名のみ（例: "1774995602_photo.jpg"）。フルURLではない
  photo: string    // image と同じ値
  ytid: string | null
  start: string    // 記事公開日時 "YYYY-MM-DD HH:mm:ss"
  published: string | null
}

type ArticlesResponse = {
  items: ArticleItem[]
  cp: {
    category: string
    limit: number
    from: number
    next: string   // 次ページの起点ID
  }
}
```

画像は api 側で外部フィードからダウンロードして S3 (RustFS) に `articles/{記事ID}.{拡張子}` の形式でキャッシュし、`/api/signage/media?key=...` 経由で再配信する。元 URL は `{FEED_IMAGE_BASE_URL}/{photo}` で組み立てる（`photo` フィールドは feed/access 双方で `_photo` 付きの同一値で、`image` フィールドは access 側で `_photo` が無いため使わない）。`FEED_IMAGE_BASE_URL` は api の環境変数。

---

## アプリケーション仕様

### api (`api`)

**使用技術**
- Hono (Node.js + TypeScript)
- Prisma + PostgreSQL
- `@hono/zod-openapi` + `@hono/swagger-ui`

**責務（MVP）**
- 外部フィードを定期取得してDBにキャッシュする
- アクセスランキングを定期取得してDBにキャッシュする
- signage に記事一覧・ランキングを返す REST エンドポイントを提供する

**エンドポイント（MVP）**

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/signage/articles` | キャッシュ済み記事一覧を返す |
| GET | `/api/signage/rankings` | キャッシュ済みアクセスランキングを返す |
| GET | `/api/signage/media?key={imageKey}` | S3 オブジェクトキーを指定して画像実体を返す (edge / admin から利用) |
| POST | `/api/admin/articles/refresh` | 記事を手動で再取得する（開発用） |
| POST | `/api/admin/rankings/refresh` | ランキングを手動で再取得する（開発用） |
| GET | `/api/auth/login` | 未ログインなら Auth0 へリダイレクト。ログイン済みなら admin トップへ戻す |
| GET | `/api/auth/callback` | Auth0 からのリダイレクトを受けてトークン交換・セッション Cookie 発行 |
| GET/POST | `/api/auth/logout` | セッションを破棄する |
| GET | `/api/auth/me` | 認証状態を返す（admin 起動時ゲート用） |

`/api/signage/*`（articles / rankings / weather / playlist / qrcode / media）は **`Authorization: Bearer {SIGNAGE_API_TOKEN}` 必須**（edge ↔ api のサーバー間認証）。`SIGNAGE_API_TOKEN` 未設定時は警告ログを出して認証をスキップする（移行用 fail-open）。

`/api/admin/*` は **Auth0 (OIDC) のセッション Cookie で保護**する（`/api/admin/media/by-key` のサムネプロキシ含む）。admin と api は同一オリジンのため Cookie が fetch / XHR / `<img>` すべてに自動付与される。api 側で OIDC 認可コードフローを処理し（`@hono/oidc-auth`）、暗号化 HttpOnly Cookie を発行するサーバーサイド方式（SPA のアクセストークン方式ではない）。`/api/admin/*` のガード (`middleware/adminAuth.ts`) は未認証時に **401** を返す（リダイレクトはログイン起点 `/api/auth/login` のみ）。OIDC env 未設定時は `SIGNAGE_API_TOKEN` 同様の fail-open で認証をスキップする。

`GET /api/signage/articles` のレスポンス例:
```json
{
  "articles": [
    {
      "id": "2382",
      "title": "沼津の「ストーリーテーラー」企画最終回...",
      "imageKey": "articles/2382.jpg",
      "description": null,
      "start": "2026-04-01T07:32:34Z"
    }
  ]
}
```

`imageKey` は S3 オブジェクトキー。実体は `GET /api/signage/media?key={imageKey}` プロキシで取得する。記事とランキングは同じ記事 ID を持つ場合 `articles/{id}.{ext}` として 1 オブジェクトを共有する。

**Prisma モデル（MVP）**

```prisma
model Article {
  id          String         @id          // フィードの id をそのまま使う
  title       String
  mediaFileId String?                     // MediaFile への FK (取得失敗時は null)
  mediaFile   MediaFile?     @relation(fields: [mediaFileId], references: [id])
  start       DateTime
  fetchedAt   DateTime       @default(now())
  description String?
  ranking     AccessRanking?              // 1 対 0..1
}

model AccessRanking {
  articleId String   @id                  // 記事 ID = PK 兼 FK
  article   Article  @relation(fields: [articleId], references: [id], onDelete: Cascade)
  rank      Int
  fetchedAt DateTime @default(now())
}

model MediaFile {
  id         String        @id @default(cuid())
  storageKey String        @unique         // 例: "articles/2382.jpg" / "uploads/<uuid>.jpg"
  mimeType   String
  type       MediaFileType                 // IMAGE / VIDEO / ARTICLE
  // ...
  articles   Article[]                     // 1:N inverse (実質 1:1)
}
```

ランキングは Article への FK で画像を共有する。AccessRanking はランキング固有の情報 (rank) のみ持ち、title/start/imageKey は JOIN で取得する。フィード取得範囲外の過去記事がランキングに含まれた場合は rankingsFetcher が Article レコードを最小情報 (title/start/photo) で作成する。

記事画像の保存可否は **MediaFile テーブルで判断する**: `cacheArticleImage` は `findUnique({ storageKey })` で既存レコードを確認し、なければ外部 fetch + S3 PUT + MediaFile.create を行う (S3 への HEAD は不要)。`MediaFile.type=ARTICLE` が記事画像であることを示す。

**フィード取得ジョブ**
- api 起動時に1回フェッチ
- その後は `FEED_FETCH_INTERVAL_MIN`（環境変数、デフォルト30分）ごとに定期実行
- `setInterval` で実装。ジョブキューは不要

**環境変数**
```
DATABASE_URL=postgresql://signage:signage@postgres:5432/signage
FEED_URL=https://...             # フィードのエンドポイントURL
FEED_IMAGE_BASE_URL=https://...  # 画像ファイル名に付けるベースURL (api 内部で外部画像取得 → S3 キャッシュに使う)
FEED_FETCH_INTERVAL_MIN=30
ACCESS_URL=https://...           # アクセスランキングのエンドポイントURL
SIGNAGE_API_TOKEN=...            # edge ↔ api 間のサーバー間認証用の共有シークレット (edge にも同値を設定)
PORT=3000
# admin 認証 (Auth0 / OIDC)。未設定の間は admin の認証を fail-open でスキップする
OIDC_ISSUER=https://<tenant>.auth0.com   # 末尾スラッシュ無し
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...
OIDC_AUTH_SECRET=...                     # セッション JWT 署名鍵。32 文字以上
OIDC_REDIRECT_URI=http://localhost:5174/api/auth/callback
OIDC_SCOPES=openid profile email
OIDC_AUDIENCE=                           # 任意 (api 向けアクセストークンが必要な場合のみ)
OIDC_AUTH_EXTERNAL_URL=http://localhost:5174  # dev の http で Secure Cookie を無効化するのに必要
ADMIN_BASE_URL=/                         # ログイン/ログアウト後の戻り先 (prod は /admin/)
# S3 (RustFS / MinIO 等)
STORAGE_ENDPOINT=http://rustfs:9000
STORAGE_REGION=ap-northeast-1
STORAGE_BUCKET=signage-media
STORAGE_ACCESS_KEY_ID=...
STORAGE_SECRET_ACCESS_KEY=...
STORAGE_FORCE_PATH_STYLE=true
STORAGE_PUBLIC_BASE_URL=http://localhost:9000/signage-media
```

---

### signage (`signage`)

**使用技術**
- Vue 3 + Vite + TypeScript
- Bootstrap 5（グリッドのみ: `bootstrap/dist/css/bootstrap-grid.min.css`）
- 独自CSS（`src/assets/signage.css`）

**責務（MVP）**
- 起動時に `GET /api/signage/articles` と `GET /api/signage/rankings` を叩いてデータを取得する
- 記事を1件ずつスライド表示する（フルスクリーン）
- 一定間隔（デフォルト8秒）で次のスライドに切り替える
- 記事が一巡したらアクセスランキングスライドを表示（デフォルト16秒）
- ランキング表示後、記事の先頭に戻りループ再生

**画面レイアウト（MVP）**

```
┌─────────────────────────────┐
│  TopBar: 時計・日付          │  固定高さ
├─────────────────────────────┤
│                             │
│  記事タイトル                │
│  記事画像                   │  残り全高
│                             │
└─────────────────────────────┘
```

横向き（16:9）のみ対応。縦向き対応は後フェーズ。

**コンポーネント構成**
```
App.vue
├── components/layout/TopBar.vue         # 時計・日付（毎秒更新）
└── components/layout/SlideArea.vue      # スライドショー制御
    ├── components/slides/NewsArticleSlide.vue    # 記事1件の表示
    └── components/slides/RankingSlide.vue        # アクセスランキング表示
```

**環境変数**
```
VITE_API_BASE_URL=/api
VITE_SLIDE_DURATION_SEC=8
VITE_RANKING_DURATION_SEC=16
```

---

### admin (`admin`)

**使用技術**
- Vue 3 + Vite + TypeScript
- PrimeVue v4（テーマ: Aura）
- Vue Router 4（Hash History）
- Pinia

**責務**
- `/api/admin/` 以下の管理用エンドポイントと通信する
- 記事・ランキングの確認・手動更新などの管理操作を提供する

**APIクライアント**
- `src/api/client.ts` の `apiFetch<T>()` 経由でのみ通信する
- ベース URL は `VITE_API_BASE_URL`（デフォルト `/api/admin`）
- signage 用の `/api/signage/` は **使わない**（admin 専用 namespace `/api/admin/` を使う）

**認証（Auth0 / セッション Cookie）**
- ログインは api の `/api/auth/*` に委ねる。フロントはトークンを一切扱わず、同一オリジンの Cookie に依存する。
- 起動時に `useAuthStore.init()` が `GET /api/auth/me` を叩き、`unauthenticated` なら `/api/auth/login` へフルページ遷移、`disabled`（api 側 fail-open）ならゲート無しで描画する。`App.vue` は `auth.ready` まで `AppShell` を出さない。
- `apiFetch` は 401 を受けたら `/api/auth/login` へ遷移する（セッション失効対策）。
- ログアウトは Sidebar のボタンから `useAuthStore.logout()`（`/api/auth/logout` へ遷移）。

**環境変数**
```
VITE_API_BASE_URL=/api/admin
```

---

## インフラ

**docker-compose サービス**

| サービス | 内容 |
|---------|------|
| `postgres` | PostgreSQL 16 |
| `api` | Node.js 20。`api` をビルドして起動 |
| `signage` | `signage` のビルド成果物を Nginx で配信 |
| `admin` | `admin` のビルド成果物を Nginx で配信（未追加） |
| `nginx` | リバースプロキシ |

**Nginx ルーティング**
```
/api/      → api:3000
/signage/  → signage コンテナ（静的ファイル）
/admin/    → admin コンテナ（静的ファイル）※未設定
```

---

## コーディング規約

- TypeScript strict モード
- Vue: Composition API（`<script setup>`）のみ使用
- api: ルーターは利用者単位でファイル分割（`src/routes/signage.ts`, `src/routes/admin.ts` 等）
- エラーレスポンスは `{ error: string }` で統一

---

## MVP 後フェーズ（今は実装しない）

- 認証（Auth0 / signage トークン）
- スライドスケジューリング（開始日・終了日）
- 画像・動画ファイルのアップロード・管理
- 画面縦向き対応
- テロップ・QRコード・ロゴ
- オフライン対応（Service Worker）
- 緊急割り込み表示
- 複数端末管理