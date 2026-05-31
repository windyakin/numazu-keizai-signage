/**
 * QR コード関連の共有ヘルパ。
 *
 * QR キーの形式は `qr/{base64url(url)}`。signage の articles レスポンスが生成し、
 * edge がこのキーから URL を復元して `/api/signage/qrcode?url=...` を叩く。
 * api / edge の双方で同じ base64url 規約を共有する必要がある。
 */

/**
 * 記事 ID から公開ページ URL を組み立てる。FEED_URL 未設定なら null。
 * FEED_URL はフィード取得用の `.php` 付きエンドポイント (例: `.../headline.php`) だが、
 * 公開ページは拡張子なしの `.../headline/{id}/` でアクセスできるため末尾の `.php` を落とす。
 */
export function buildArticleUrl(id: string): string | null {
  const base = process.env.FEED_URL;
  if (!base) return null;
  const cleaned = base.replace(/\/+$/, "").replace(/\.php$/i, "");
  return `${cleaned}/${id}/`;
}

/** 対象 URL から edge 同期用の QR キーを導出する (`qr/{base64url(url)}`)。 */
export function qrKeyForUrl(url: string): string {
  return `qr/${Buffer.from(url, "utf8").toString("base64url")}`;
}
