# CLAUDE.md — signage パッケージ

ルートの [CLAUDE.md](../../CLAUDE.md) も併読すること。ここには signage パッケージ固有の実装詳細のみを書く。

---

## ディレクトリ構成

```
packages/signage/
├── index.html
├── vite.config.ts
├── nginx.conf                 # 本番配信用（docker-compose の nginx から参照）
├── Dockerfile
├── public/
├── src/
│   ├── main.ts                # createApp のみ
│   ├── App.vue                # TopBar + SlideArea を並べるだけ
│   ├── api/                   # REST クライアント（fetch ラッパ）
│   │   ├── feed.ts
│   │   └── access.ts
│   ├── composables/           # 再利用ロジック
│   │   └── useClock.ts
│   ├── components/
│   │   ├── layout/            # 画面全体の枠組み
│   │   │   ├── TopBar.vue
│   │   │   └── SlideArea.vue  # スライドショー制御の本体
│   │   └── slides/            # 1枚のスライド = 1ファイル
│   │       ├── NewsArticleSlide.vue
│   │       └── AccessRankingSlide.vue
│   └── assets/
│       ├── signage.css        # グローバル CSS（CSS 変数をここで定義）
│       └── logo.png
└── package.json
```

---

## コンポーネント方針

- Composition API (`<script setup lang="ts">`) のみ。Options API は使わない。
- スコープ付き `<style scoped>` を基本とする。全体テーマは [src/assets/signage.css](src/assets/signage.css) の CSS 変数経由で参照する（`var(--color-primary)` など）。
- レイアウトの骨組みは Bootstrap 5 のグリッド (`bootstrap/dist/css/bootstrap-grid.min.css`) のみを利用。コンポーネントクラス（`btn`, `card` 等）は使わない。
- スライド追加時は [src/components/slides/](src/components/slides/) に 1 ファイル = 1 スライドで作り、[SlideArea.vue](src/components/layout/SlideArea.vue) で制御する。

---

## スライドショー制御（[SlideArea.vue](src/components/layout/SlideArea.vue)）

- 記事を `VITE_SLIDE_DURATION_SEC`（デフォルト8秒）ごとに切り替える。
- 記事が一巡したら `AccessRankingSlide` を `VITE_RANKING_DURATION_SEC`（デフォルト16秒）表示し、記事の先頭に戻る。
- タイマーは `setTimeout` を 1 本だけ保持し、`scheduleNext(seconds)` で使い回す。`setInterval` は使わない（スライド種別ごとに尺が違うため）。
- `<Transition name="slide" mode="out-in">` で CSS フェード。遷移時間は `--transition-duration`。
- API 取得失敗時はエラーメッセージを全面表示しループは始めない。
- デバッグ用途で URL ハッシュによる固定表示をサポート:
  - `#access-ranking` → ランキングスライドを固定。
  - `#article-{N}` → N 番目の記事を固定（0 始まり）。
  - `debugFixed` が立っている間はタイマーを起動しない。

---

## API クライアント ([src/api/](src/api/))

- `VITE_API_BASE_URL`（デフォルト `http://127.0.0.1:8080/api` = ローカルの edge）を起点にする。file:// で開かれる前提のため絶対 URL。
- 各モジュールは型とフェッチ関数を export する（`Article`, `fetchArticles` など）。ストア等は挟まない。
- レスポンスの日時は ISO 文字列のまま保持し、描画直前に `new Date()` する。

---

## 時計表示

[composables/useClock.ts](src/composables/useClock.ts) が毎秒更新の `now` を提供する。[TopBar.vue](src/components/layout/TopBar.vue) から利用。新規に時刻を扱うコンポーネントを作る場合も同じ composable を使い、独自 `setInterval` を生やさない。

---

## 環境変数（Vite）

| 変数 | デフォルト | 用途 |
|------|-----------|------|
| `VITE_API_BASE_URL` | `http://127.0.0.1:8080/api` | edge エンドポイントの基点（絶対 URL） |
| `VITE_SLIDE_DURATION_SEC` | `8` | 記事1枚の表示秒数 |
| `VITE_RANKING_DURATION_SEC` | `16` | ランキング表示秒数 |

すべて `import.meta.env.VITE_*` で参照。ビルド時に埋め込まれるので、コンテナでは build 時に渡す必要がある。

---

## 開発・ビルド

- `npm run dev` : Vite dev server（`--host 0.0.0.0`）。docker-compose 経由でアクセスできるように開放済み。
- `npm run build` : `vue-tsc -b && vite build`。型エラーはビルドを落とす。
- 本番配信は Nginx（[nginx.conf](nginx.conf)）で `dist/` を配る。ルーティングは root CLAUDE.md 参照。

---

## デザイン前提

- 16:9 横向き専用。縦向き・レスポンシブは MVP 対象外。
- フォントサイズ・余白は画面サイズに対して相対（`vw` / `vh` / `%`）で指定する傾向。ピクセル固定を増やす前に既存の CSS 変数と揃える。
- `cursor: none`（カーソル非表示）が global に効いている。デバッグ時は開発者ツールで一時解除。
