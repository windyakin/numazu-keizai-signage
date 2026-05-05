# edge

サイネージ端末上で動く Go 製のローカルキャッシュサーバー。上流 `api` から表示データと画像を pull し、SQLite とローカルファイルにキャッシュする。signage (ブラウザ) からのリクエストに応じてキャッシュを返す。

## アーキテクチャ

```
api (クラウド) --HTTPS(5分間隔)--> edge (127.0.0.1:8080) --HTTP--> signage (file://)
                                    |
                                    +-- SQLite (articles / rankings / media_cache)
                                    +-- media/ (画像実体)
```

signage は file:// で開かれ、画像は相対パスで `./media/...` を直接参照する (HTTP 配信しない)。そのため **signage dist と edge の media ディレクトリは端末上で同一親ディレクトリに配置する** 必要がある。

```
/opt/signage/
├── index.html          <- signage dist
├── assets/
└── media/              <- edge がここに画像を書き込む
    └── ab/cd/<sha>.jpg
```

## 環境変数

| 変数名 | 既定値 | 説明 |
|-------|--------|------|
| `UPSTREAM_API_URL` | (必須) | 上流 api のベース URL (例: `https://api.example.com`) |
| `POLL_INTERVAL_MIN` | `5` | 上流を pull する間隔 (分) |
| `MEDIA_DIR` | `./media` | 画像保存先ディレクトリ |
| `DB_PATH` | `./edge.db` | SQLite ファイルパス |
| `LISTEN_ADDR` | `127.0.0.1:8080` | HTTP 待ち受けアドレス |
| `MEDIA_URL_PREFIX` | `./media` | signage に返す imageUrl の prefix |

## 開発

```sh
npm run dev    # go run ./cmd/edge
npm run build  # dist/edge バイナリ生成
npm run test   # go test ./...
npm run lint   # go vet ./...
```

起動時にカレントディレクトリの `.env` を自動で読み込む (godotenv)。`UPSTREAM_API_URL` は `.env` か shell 環境変数のどちらかで設定する。`.env` が存在しなくてもエラーにはならない。

## 端末へのデプロイ (本番)

1. `npm run build` で `dist/edge` バイナリを生成 (GOOS/GOARCH を端末に合わせる)
2. signage の `dist/` と edge バイナリを端末に転送
3. 上記レイアウトで配置 (signage dist と `media/` を同一親ディレクトリ)
4. systemd / launchd で edge を常駐起動
5. Chromium を `--allow-file-access-from-files` フラグ付きで起動し、`file://.../index.html` を開く
