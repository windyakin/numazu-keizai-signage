# CLAUDE.md — デジタルサイネージシステム（MVP）

## MVP のゴール

ニュースフィードから記事を取得し、サイネージ画面にスライド表示する。
管理画面・認証・スケジュール管理・ファイルアップロードは後フェーズ。

---

## リポジトリ構成（モノレポ）

```
/
├── packages/
│   ├── api/        # Hono (Node.js + TypeScript)
│   └── signage/    # Vue 3 + Vite + TypeScript
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
type FeedItem = {
  id: string
  title: string
  image: string    // ファイル名のみ（例: "1774995602_photo.jpg"）。フルURLではない
  photo: string    // image と同じ値
  ytid: string | null
  start: string    // 記事公開日時 "YYYY-MM-DD HH:mm:ss"
  published: string | null
}

type FeedResponse = {
  items: FeedItem[]
  cp: {
    category: string
    limit: number
    from: number
    next: string   // 次ページの起点ID
  }
}
```

画像のフルURLは `{FEED_IMAGE_BASE_URL}/{image}` で構築する。
`FEED_IMAGE_BASE_URL` は api の環境変数として管理する。

---

## アプリケーション仕様

### api (`packages/api`)

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
| GET | `/api/feed/articles` | キャッシュ済み記事一覧を返す |
| POST | `/api/feed/refresh` | フィードを手動で再取得する（開発用） |
| GET | `/api/access/rankings` | キャッシュ済みアクセスランキングを返す |
| POST | `/api/access/refresh` | ランキングを手動で再取得する（開発用） |

`GET /api/feed/articles` のレスポンス例:
```json
{
  "articles": [
    {
      "id": "2382",
      "title": "沼津の「ストーリーテーラー」企画最終回...",
      "imageUrl": "https://example.com/images/1774995602_photo.jpg",
      "start": "2026-04-01T07:32:34Z"
    }
  ]
}
```

**Prisma モデル（MVP）**

```prisma
model Article {
  id        String   @id          // フィードの id をそのまま使う
  title     String
  imageUrl  String               // ベースURL補完済みのフルURL
  start     DateTime
  fetchedAt DateTime @default(now())
}

model AccessRanking {
  id        String   @id          // フィードの id をそのまま使う
  title     String
  imageUrl  String               // ベースURL補完済みのフルURL
  rank      Int                  // ランキング順位
  start     DateTime
  fetchedAt DateTime @default(now())
}
```

**フィード取得ジョブ**
- api 起動時に1回フェッチ
- その後は `FEED_FETCH_INTERVAL_MIN`（環境変数、デフォルト30分）ごとに定期実行
- `setInterval` で実装。ジョブキューは不要

**環境変数**
```
DATABASE_URL=postgresql://signage:signage@postgres:5432/signage
FEED_URL=https://...             # フィードのエンドポイントURL
FEED_IMAGE_BASE_URL=https://...  # 画像ファイル名に付けるベースURL
FEED_FETCH_INTERVAL_MIN=30
ACCESS_URL=https://...           # アクセスランキングのエンドポイントURL
PORT=3000
```

---

### signage (`packages/signage`)

**使用技術**
- Vue 3 + Vite + TypeScript
- Bootstrap 5（グリッドのみ: `bootstrap/dist/css/bootstrap-grid.min.css`）
- 独自CSS（`src/assets/signage.css`）

**責務（MVP）**
- 起動時に `GET /api/feed/articles` と `GET /api/access/rankings` を叩いてデータを取得する
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
    └── components/slides/AccessRankingSlide.vue  # アクセスランキング表示
```

**環境変数**
```
VITE_API_BASE_URL=/api
VITE_SLIDE_DURATION_SEC=8
VITE_RANKING_DURATION_SEC=16
```

---

## インフラ

**docker-compose サービス**

| サービス | 内容 |
|---------|------|
| `postgres` | PostgreSQL 16 |
| `api` | Node.js 20。`packages/api` をビルドして起動 |
| `signage` | `packages/signage` のビルド成果物を Nginx で配信 |
| `nginx` | リバースプロキシ |

**Nginx ルーティング**
```
/api/      → api:3000
/signage/  → signage コンテナ（静的ファイル）
```

---

## コーディング規約

- TypeScript strict モード
- Vue: Composition API（`<script setup>`）のみ使用
- api: ルーターはリソースごとにファイル分割（`src/routes/feed.ts` 等）
- エラーレスポンスは `{ error: string }` で統一

---

## MVP 後フェーズ（今は実装しない）

- 管理画面（admin）
- 認証（Auth0 / signage トークン）
- スライドスケジューリング（開始日・終了日）
- 画像・動画ファイルのアップロード・管理
- 画面縦向き対応
- テロップ・QRコード・ロゴ
- オフライン対応（Service Worker）
- 緊急割り込み表示
- 複数端末管理