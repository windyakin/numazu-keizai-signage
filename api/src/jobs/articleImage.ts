import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { createStorageClient, uploadObject } from "../storage.js";

const EXT_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

function pickExtension(filename: string): string | null {
  const idx = filename.lastIndexOf(".");
  if (idx < 0) return null;
  const ext = filename.slice(idx).toLowerCase();
  if (ext.length === 0 || ext.length > 6) return null;
  return ext;
}

/**
 * 外部フィードの記事画像を S3 (RustFS) にキャッシュし、対応する MediaFile レコードの id を返す。
 * MediaFile テーブルの存在で S3 上の保存有無を判定する (HEAD 不要)。失敗時は null を返す。
 */
export async function cacheArticleImage(
  articleId: string,
  sourceFilename: string
): Promise<string | null> {
  if (!sourceFilename) return null;

  const ext = pickExtension(sourceFilename);
  if (!ext) return null;

  const storageKey = `articles/${articleId}${ext}`;

  // MediaFile レコード経由で S3 保存済みか判定
  const existing = await prisma.mediaFile.findUnique({ where: { storageKey } });
  if (existing) return existing.id;

  const imageBaseUrl = process.env.FEED_IMAGE_BASE_URL;
  if (!imageBaseUrl) {
    console.error("[articleImage] FEED_IMAGE_BASE_URL is not set");
    return null;
  }

  const sourceUrl = `${imageBaseUrl.replace(/\/+$/, "")}/${sourceFilename.replace(/^\/+/, "")}`;
  let response: Response;
  try {
    response = await fetch(sourceUrl);
  } catch (e) {
    console.error(`[articleImage] fetch ${sourceUrl}:`, e);
    return null;
  }
  if (!response.ok) {
    console.error(`[articleImage] fetch ${sourceUrl}: status ${response.status}`);
    return null;
  }

  const mimeType = response.headers.get("content-type") ?? EXT_TO_MIME[ext] ?? "application/octet-stream";
  const buffer = Buffer.from(await response.arrayBuffer());

  const bucket = process.env.STORAGE_BUCKET ?? "signage-media";
  const client = createStorageClient();
  try {
    await uploadObject(client, bucket, storageKey, buffer, mimeType);
  } catch (e) {
    console.error(`[articleImage] upload ${storageKey}:`, e);
    return null;
  }

  try {
    const created = await prisma.mediaFile.create({
      data: {
        storageKey,
        mimeType,
        type: "ARTICLE",
        originalName: sourceFilename,
        sizeBytes: BigInt(buffer.byteLength),
      },
    });
    return created.id;
  } catch (e) {
    // articles / rankings ジョブが同じ記事画像 (storageKey 共有) を並行処理すると
    // findUnique をすり抜けて両方が create に到達しうる。ユニーク制約違反 (P2002) は
    // 「他方が先に作成した」だけなので、既存レコードを引き直して返す。
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await prisma.mediaFile.findUnique({ where: { storageKey } });
      if (existing) return existing.id;
    }
    throw e;
  }
}
