# 各レイヤーのキャッシュと更新

signage → edge → api の3レイヤーで、データをどこに保持し、いつ更新（再取得）するかをまとめる。

## 全体の流れ

```mermaid
flowchart TD
    source["外部フィード / 外部S3"]
    api["<b>api</b><br/>PostgreSQL + S3"]
    edge["<b>edge</b><br/>SQLite + ローカルfile"]
    signage["<b>signage</b><br/>メモリ (Vue ref)"]

    source -->|pull (30分)| api
    api -->|pull (5分) + media drain (30秒 / trigger)| edge
    edge -->|articles/rankings: 起動時 + 10分| signage
    edge -->|playlist: 起動時 + ループ完了ごと<br/>(空時は30秒リトライ)| signage
```

---

## 1. api レイヤー（信頼源）

**保存先**: PostgreSQL（Article / AccessRanking / Playlist / MediaFile）+ S3（アップロード済みメディア）

### 取得タイミング

| ジョブ | トリガー | 周期 | 動作 |
|---|---|---|---|
| `fetchFeed()` [feedFetcher.ts:36-111](../packages/api/src/jobs/feedFetcher.ts#L36-L111) | 起動時即実行 → setInterval | `FEED_FETCH_INTERVAL_MIN`（既定30分） | 外部フィード POST → `Article.upsert`（id キー） |
| `fetchAccessRanking()` [accessFetcher.ts:23-86](../packages/api/src/jobs/accessFetcher.ts#L23-L86) | 起動時即実行 → setInterval | 同上（30分） | 外部 POST → **deleteMany → create** で全置換 |
| 手動 refresh [admin.ts:398-416](../packages/api/src/routes/admin.ts#L398-L416) | `POST /api/admin/feed/refresh` 等 | - | 同ロジックを同期実行 |

### signage 向けエンドポイント

すべて **DBから直接返す**（外部APIには都度叩かない）:

- `GET /api/signage/articles` → `Article.findMany`
- `GET /api/signage/rankings` → `AccessRanking.findMany`
- `GET /api/signage/playlist` → `Playlist.findFirst({ isActive: true })`、ない場合は記事5件+ランキング1枚の fallback

### メディア配信

- `GET /api/media/proxy?url=...` → 外部URLを取ってきてプロキシ
- `GET /api/signage/media?key=...` → S3 からプロキシ、`Cache-Control: max-age=31536000, immutable`

**鮮度**: `fetchedAt` カラム（記事は個別、ランキングは全件同タイムスタンプ）

---

## 2. edge レイヤー（オフラインキャッシュ）

**保存先**: SQLite（`articles` / `rankings` / `playlist_items` / `media_cache` / `playlist_media`）+ ローカル `media/` ディレクトリ

### Sync goroutine（並行3本）

[main.go:45-52](../packages/edge/cmd/edge/main.go#L45-L52) で起動。すべて起動時に1回 + `POLL_INTERVAL_MIN`（既定5分）の `time.Ticker`：

| sync | 取得元 | 保存戦略 |
|---|---|---|
| Feed [sync/feed.go:28-72](../packages/edge/internal/sync/feed.go#L28-L72) | api `GET /api/signage/articles` | `articles` を **id で upsert** + 画像URLを `media_cache` に enqueue |
| Access [sync/access.go:28-71](../packages/edge/internal/sync/access.go#L28-L71) | api `GET /api/signage/rankings` | `rankings` を **全置換** + 画像URLを enqueue |
| Playlist [sync/playlist.go:71-141](../packages/edge/internal/sync/playlist.go#L71-L141) | api `GET /api/signage/playlist` | `playlist_items` を全置換 + IMAGE/VIDEO の `storageKey` を `playlist_media` に enqueue |

### MediaSyncer（画像/動画 DL ワーカー）

[sync/media.go:84-183](../packages/edge/internal/sync/media.go#L84-L183)

- **トリガー**: 30秒ごとの ticker、または sync 完了時の trigger チャネル
- **並列度**: 4 worker
- **保存パス**: `sha256(sourceURL)` をハッシュ化し `media/<ab>/<cd>/<sha256>.<ext>` に書き込み（`.tmp` → atomic rename）
- **状態管理**: `media_cache.status = pending → ready / failed`（最大3リトライ）

### signage 向けエンドポイント（すべてキャッシュから返す）

- `GET /api/feed/articles` [server/feed.go:21-42](../packages/edge/internal/server/feed.go#L21-L42) → `articles JOIN media_cache WHERE status='ready'`
- `GET /api/access/rankings` [server/access.go:22-49](../packages/edge/internal/server/access.go#L22-L49) → 同様の JOIN
- `GET /api/signage/playlist` [server/playlist.go:28-77](../packages/edge/internal/server/playlist.go#L28-L77) → `playlist_items` のうち media が ready のもの

`imageUrl` は `MEDIA_URL_PREFIX + localPath`（既定では `file://...`）に書き換えて返す。

**重要な動作**: 画像が `pending`/`failed` の記事は **JOIN で除外され、一時的に signage に返されない**。DL完了後の次回フェッチで初めて見える。

---

## 3. signage レイヤー（表示）

**保存先**: Vue の `ref`（メモリのみ。IndexedDB等は使わない）

### 状態 [SlideArea.vue](../packages/signage/src/components/layout/SlideArea.vue)

```ts
playlistItems = ref<PlaylistItem[]>([])
articles      = ref<Article[]>([])
rankingsData  = ref<RankingsData>({...})
```

### 取得タイミング

playlist と articles/rankings で取得戦略が違う:

| 対象 | トリガー | 動作 |
|---|---|---|
| 全データ（初期化） | `onMounted` の `loadInitial()` | `Promise.all([fetchPlaylist, fetchArticles, fetchRankings])` で edge から3本並列取得 |
| **playlist** | `advance()` でループ末尾 → 先頭への wrap-around を検知 | `fetchNextPlaylist()` を非同期発火し結果を `pendingPlaylist` に保留。**次のループ完了時**に `playlistItems` へ swap。再生中のループ構成は変えない |
| **playlist (空時)** | `setInterval(retryWhenEmpty, 30秒)` | `playlistItems` が空のときだけ `loadInitial()` を再実行。items が入ったら `error` を解除して再生開始。items があるときは即 return の no-op |
| **articles / rankings** | `setInterval(refreshArticlesAndRankings, ...)` | `VITE_PLAYLIST_REFRESH_INTERVAL_MIN`（既定10分）ごとに2本まとめて再取得。エラーは silent ignore |

スライド切替自体は `setTimeout` ベース（`durationSec`、VIDEO は `ended` イベントで進行）で、**データ再取得とは独立**。

`pendingPlaylist` への上書きは無条件（差分判定なし）。空配列が返ったときは swap せず現プレイリストを維持する。fetch 失敗（wrap 時）は silent ignore で既存プレイリスト続行。

### isReady 判定 [SlideArea.vue:36-50](../packages/signage/src/components/layout/SlideArea.vue#L36-L50)

- ARTICLE_LATEST/RANDOM → `articles.length > 0`
- RANKING → `rankingsData.rankings.length > 0`
- IMAGE/VIDEO → `payload !== null`

ready でないアイテムは `findNextValidIndex` で自動スキップ。

---

## データ別の更新ラグ（最悪ケース）

外部での変更が signage に届くまでの累積遅延：

| データ | api ↔ source | edge ↔ api | signage ↔ edge | 合計 |
|---|---|---|---|---|
| 記事本体 | ≤30分 | ≤5分 | ≤10分 | **最大45分** |
| 記事画像 | 即時(S3) | DL完了まで（30秒+α） | ≤10分 | DL+10分 |
| ランキング | ≤30分 | ≤5分 | ≤10分 | **最大45分** |
| プレイリスト定義（admin編集） | 即時 | ≤5分 | 最大2ループ分（空時は ≤30秒）<sup>※</sup> | **5分 + 2ループ分** |
| アップロード済メディア | 即時 | playlist sync後 DL | 最大2ループ分 | DL + 2ループ分 |

<sup>※</sup> 編集が wrap 直後に入ったケース。1ループ目末尾の wrap で fetch、2ループ目末尾の wrap で swap となり、最悪 2ループ分の遅延になる。

---

## 設計上のポイント

- **api**: 外部フィードの取得は api 起動時固定の `setInterval`。プロセス再起動以外で周期は変わらない。
- **edge**: 「メディア ready」が表示の前提条件。DL失敗中は記事ごと隠れる仕様で、signage 側で「画像なしフォールバック」は持っていない。
- **signage**: articles/rankings は時刻駆動（10分）、playlist のみループ完了駆動 + 空時 30秒リトライ。api/edge 側の更新を能動的に通知する仕組み（WebSocket/SSE等）はない。
- **signage**: 再生中の差し替え抑止のため、playlist は wrap-around 検知時にだけ swap される。debug hash (`#item-N`) で固定中は `advance()` 自体が早期 return するため、playlist の更新も止まる。
