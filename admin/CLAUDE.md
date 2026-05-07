# CLAUDE.md — admin パッケージ

ルートの [CLAUDE.md](../CLAUDE.md) も併読すること。ここには admin パッケージ固有の実装詳細のみを書く。

---

## ディレクトリ構成

```
admin/
├── index.html
├── vite.config.ts
├── Dockerfile                  # 未作成（Docker 対応は後フェーズ）
├── src/
│   ├── main.ts                 # Vue + PrimeVue + Router + Pinia のセットアップ
│   ├── App.vue                 # <RouterView /> のみ
│   ├── api/                    # REST クライアント（fetch ラッパー）
│   │   ├── client.ts           # 共通 apiFetch<T> — ベース URL 管理はここ
│   │   ├── articles.ts         # 記事 API (/api/admin/articles など)
│   │   └── rankings.ts         # ランキング API (/api/admin/rankings など)
│   ├── stores/                 # Pinia ストア
│   ├── router/
│   │   └── index.ts            # Vue Router（Hash History）
│   ├── views/                  # ページ単位のコンポーネント
│   │   └── HomeView.vue
│   └── components/             # 再利用コンポーネント
└── package.json
```

---

## コンポーネント・コーディング方針

- Composition API（`<script setup lang="ts">`）のみ。Options API は使わない。
- UI コンポーネントはすべて PrimeVue v4 を使う。Bootstrap やカスタム UI は入れない。
- スコープ付き `<style scoped>` を基本とする。グローバルスタイルが必要な場合は `src/assets/admin.css` に追加し `main.ts` で import する。
- ページ = `src/views/` の 1 ファイル。再利用コンポーネントは `src/components/` に置く。

---

## API クライアント ([src/api/](src/api/))

バックエンド側の admin 専用ルート（`/api/admin/`）と通信する。signage 用ルート（`/api/signage/`）は **使わない**。

- `VITE_API_BASE_URL`（デフォルト `/api/admin`）を起点にする。
- すべてのリクエストは [src/api/client.ts](src/api/client.ts) の `apiFetch<T>(path, init?)` を経由する。直接 `fetch` は呼ばない。
- 各モジュールは型とフェッチ関数を export する。Pinia ストアや Vue コンポーネントからインポートして使う。
- エラー時は `apiFetch` が `Error` を throw する。呼び出し側で `try/catch` するか、Pinia ストアに閉じ込める。

現在のエンドポイント対応（バックエンド実装待ち）:

| 関数 | メソッド | パス（base からの相対） | 説明 |
|------|---------|----------------------|------|
| `fetchArticles()` | GET | `/articles` | 記事一覧取得 |
| `refreshArticles()` | POST | `/articles/refresh` | 記事を手動再取得 |
| `fetchRankings()` | GET | `/rankings` | ランキング取得 |
| `refreshRankings()` | POST | `/rankings/refresh` | ランキングを手動再取得 |

---

## 状態管理（Pinia）

- ストアは `src/stores/` に `use{Resource}Store.ts` の命名で追加する。
- API 取得データのキャッシュ・ローディング状態・エラー状態はストアに持つ。
- コンポーネントから直接 `apiFetch` を呼ばず、ストアのアクションを介す（再利用・テストのため）。

---

## ルーティング

- [src/router/index.ts](src/router/index.ts) に `createWebHistory()` で設定済み。
- ページを追加するときは `routes` 配列にエントリを追加し、対応する View を `src/views/` に作成する。
- ルートは静的インポートで十分。ページ数が増えたら遅延インポート（`() => import(...)`）に切り替える。

---

## PrimeVue v4

- テーマプリセット: **Aura**（`@primeuix/themes/aura`）。`@primevue/themes` は deprecated のため使わない。
- コンポーネントは使用するファイルで明示 import する（例: `import Button from 'primevue/button'`）。自動登録（unplugin-vue-components 等）は導入していない。
- アイコンは `primeicons` を使う（`pi pi-*` クラス）。
- v3 由来の API は使わない:
  - DataTable の `responsiveLayout` は v4 で削除済み。スタック表示が必要なら `breakpoint` を使う。
  - 行ドラッグ並び替えは `<Column rowReorder />` + `@rowReorder` イベントで実現する。`reorderableRows` プロップは v4 に存在しない。
  - `useConfirm` の `acceptClass` / `acceptLabel` / `rejectLabel` は使わない。`acceptProps` / `rejectProps` にラベル・severity・outlined などをまとめる。

### コンポーネント内部の見た目をいじりたいとき

PrimeVue v4 の Pass Through (PT) を第一手段にする。`:deep(...)` セレクタや、コンポーネント内部の `.p-*` クラスを狙ったグローバル CSS は基本的に使わない。

- PT は MCP の `mcp__primevue__get_component_pt` で各コンポーネントのパート名を確認できる（例: Menubar の `button` / `itemContent` / `submenu` 等）。
- 静的なクラス／属性付与は属性記法が短い: `<Menubar pt:button:class="ml-auto">`。
- 複数まとめるならオブジェクト記法: `:pt="{ button: { class: 'ml-auto' }, submenu: { class: '...' } }"`。
- 動的に出し分けたいときは関数 PT が使える: `:pt="{ item: ({ context }) => ({ class: ... }) }"`。
- スロット (`#item` 等) で自分が描画した要素は親コンポーネントの scoped CSS が普通に当たる。`:deep` は不要なのでまずスロット側で済むかを検討する。

## レイアウト・ユーティリティ CSS

- 余白・flex・サイズなどのユーティリティクラスは **PrimeFlex** を使う（[main.ts](src/main.ts) で `primeflex/primeflex.css` を import 済み）。
- 主に使うクラス: `flex` / `flex-column` / `align-items-*` / `justify-content-*` / `gap-{1..6}` / `m{,t,r,b,l,x,y}-{0..6}` / `p{,t,r,b,l,x,y}-{0..6}` / `w-full` / `text-{xs,sm,base,lg,xl,2xl}` / `text-color-secondary` / `font-semibold` / `border-round` / `cursor-pointer` / `hidden` / `white-space-nowrap`。
- 1 ファイル内で繰り返し出る独自レイアウトのみ `<style scoped>` に書く。`width`/`max-width`/`padding` のページレベルの寸法は scoped CSS、汎用 flex/gap/margin は PrimeFlex クラスで揃える方針。
- 色は CSS 変数 `--p-*`（例: `var(--p-content-border-color)`）を使い、ハードコードした hex は避ける。

---

## 環境変数（Vite）

| 変数 | デフォルト | 用途 |
|------|-----------|------|
| `VITE_API_BASE_URL` | `/api/admin` | admin API の起点 URL |

すべて `import.meta.env.VITE_*` で参照。ビルド時に埋め込まれる。

---

## 開発・ビルド

- `npm run dev:admin`（ルートから）または `npm run dev`（パッケージ内）: Vite dev server 起動。
- dev サーバーは `/api` → `http://localhost:3000` にプロキシする。api パッケージも同時起動すること。
- `npm run build`: `vue-tsc -b && vite build`。型エラーはビルドを落とす。
- 出力先: `dist/`。本番配信方法（Nginx / Docker）は後フェーズ。
