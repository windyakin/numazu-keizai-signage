/**
 * QR コード関連の共有ヘルパ。
 *
 * QR キーの形式は `qr/{base64url(url)}`。signage の articles レスポンスが生成し、
 * edge がこのキーから URL を復元して `/api/signage/qrcode?url=...` を叩く。
 * api / edge の双方で同じ base64url 規約を共有する必要がある。
 */

/**
 * 記事 ID から公開ページ URL を組み立てる。FEED_URL 未設定なら null。
 * FEED_URL のオリジン部分を取り出し `/headline/{id}/` を付与する。
 */
export function buildArticleUrl(id: string): string | null {
  const base = process.env.FEED_URL;
  if (!base) return null;
  try {
    const origin = new URL(base).origin;
    return `${origin}/headline/${id}/`;
  } catch {
    return null;
  }
}

/** 対象 URL から edge 同期用の QR キーを導出する (`qr/{base64url(url)}`)。 */
export function qrKeyForUrl(url: string): string {
  return `qr/${Buffer.from(url, "utf8").toString("base64url")}`;
}
