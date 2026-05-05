# CLAUDE.md — api パッケージ

ルートの [CLAUDE.md](../../CLAUDE.md) も併読すること。ここには api パッケージ固有の実装詳細のみを書く。

---

## ディレクトリ構成

```
packages/api/
├── prisma/
│   ├── schema.prisma          # Article / AccessRanking モデル
│   └── migrations/            # prisma migrate が生成するマイグレーション
├── src/
│   ├── index.ts               # エントリポイント。OpenAPIHono を構築しジョブを起動
│   ├── db.ts                  # PrismaClient のシングルトン
│   ├── routes/                # リソース単位でルータを分割
│   │   ├── signage.ts         # /api/signage/*
│   │   ├── admin.ts           # /api/admin/*
│   │   └── media.ts           # /api/signage/media など
│   └── jobs/                  # 定期実行ジョブ
│       ├── articlesFetcher.ts # 記事一覧取得
│       └── rankingsFetcher.ts # アクセスランキング取得
├── Dockerfile
├── entrypoint.sh              # prisma migrate deploy → node 起動
├── tsconfig.json
└── package.json
```

---

## ルート追加時の手順

1. [src/routes/](src/routes/) に `{resource}.ts` を新規作成。
2. `OpenAPIHono` インスタンスを `export const {resource}App` として公開。
3. `createRoute` で定義してから `.openapi(route, handler)` で実装する。素の `.get` / `.post` は使わない（OpenAPI に載らないため）。
4. [src/index.ts](src/index.ts) で `app.route("/", {resource}App)` を追加。
5. Zod スキーマはハンドラと同じファイルの上部にまとめる。

レスポンススキーマ共通ルール:
- エラーは `{ error: string }` に統一（`ErrorResponseSchema`）。
- 日時フィールドは ISO 8601 文字列で返す（`.toISOString()`）。

---

## Prisma の扱い

- クライアントは [src/db.ts](src/db.ts) からのみ import する。各ファイルで `new PrismaClient()` しないこと。
- スキーマ変更時:
  - 開発環境: `npm run prisma:migrate:dev -- --name {description}`
  - 本番: コンテナ起動時に [entrypoint.sh](entrypoint.sh) が `prisma migrate deploy` を実行する。
- 生成物 (`@prisma/client`) は `npm run prisma:generate` で更新。`postinstall` ではないため忘れやすい。

---

## 定期ジョブの実装パターン

[src/jobs/articlesFetcher.ts](src/jobs/articlesFetcher.ts) と [src/jobs/rankingsFetcher.ts](src/jobs/rankingsFetcher.ts) が参照実装。

- `fetch{Resource}()` を純粋な非同期関数として export（`POST /api/admin/{resource}/refresh` からも再利用する）。
- `start{Resource}Job()` で起動時1回 + `setInterval` で定期実行。ジョブキューは入れない。
- 失敗しても起動を止めない（`console.error` してプロセスは生かす）。
- 取得間隔は `FEED_FETCH_INTERVAL_MIN`（デフォルト30分）を articles / rankings ジョブで共用している。
- アクセスランキングは毎回 `deleteMany()` してから insert する（差分 upsert ではなく総入れ替え）。記事は `upsert`（id キー）。

外部フィードへのリクエストは `POST + x-www-form-urlencoded + X-Requested-With: XMLHttpRequest` が必須。素の GET だと返らない。

---

## ESM 注意点

- `tsconfig` は ESM 出力。相対 import には必ず `.js` 拡張子を付ける（`./routes/admin.js`）。TS ファイルでも `.js` と書く。
- 実行は `tsx`（ビルド無しで TS を直接実行）。開発は `npm run dev`（watch）。

---

## 環境変数

ルート CLAUDE.md の記載に加えて、実装上の注意:

| 変数 | 必須 | 用途 |
|------|------|------|
| `DATABASE_URL` | 必須 | Prisma 接続先 |
| `FEED_URL` | 必須 | フィード POST 先。未設定だとジョブが throw |
| `FEED_IMAGE_BASE_URL` | 必須 | `{base}/{image}` で画像 URL を組み立てる |
| `ACCESS_URL` | 必須 | アクセスランキング POST 先 |
| `FEED_FETCH_INTERVAL_MIN` | 任意 | デフォルト 30。articles / rankings ジョブ共用 |
| `PORT` | 任意 | デフォルト 3000 |

---

## Swagger

- JSON: `GET /doc/json`
- UI: `GET /doc`

ルートを追加したら UI で疎通確認するとレスポンス形式のズレに気付きやすい。
