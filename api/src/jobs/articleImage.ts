import { Prisma } from "../generated/prisma/client.js";
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
 * 外部画像を S3 (RustFS) にキャッシュし、対応する MediaFile レコードの id を返す。
 * MediaFile テーブルの存在で S3 上の保存有無を判定する (HEAD 不要)。失敗時は null を返す。
 *
 * @param articleId 記事 ID (storageKey の組み立てに使う)
 * @param imageUrl  画像の完全 URL (例: "https://images.keizai.biz/izu_keizai/headline/xxx.jpg")
 */
export async function cacheArticleImage(
  articleId: string,
  imageUrl: string
): Promise<string | null> {
  if (!imageUrl) return null;

  let pathname: string;
  try {
    pathname = new URL(imageUrl).pathname;
  } catch {
    console.error(`[articleImage] invalid URL: ${imageUrl}`);
    return null;
  }

  const ext = pickExtension(pathname);
  if (!ext) return null;

  const storageKey = `articles/${articleId}${ext}`;

  // MediaFile レコード経由で S3 保存済みか判定
  const existing = await prisma.mediaFile.findUnique({ where: { storageKey } });
  if (existing) return existing.id;

  let response: Response;
  try {
    response = await fetch(imageUrl);
  } catch (e) {
    console.error(`[articleImage] fetch ${imageUrl}:`, e);
    return null;
  }
  if (!response.ok) {
    console.error(`[articleImage] fetch ${imageUrl}: status ${response.status}`);
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
        originalName: pathname.split("/").pop() ?? imageUrl,
        sizeBytes: BigInt(buffer.byteLength),
      },
    });
    return created.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await prisma.mediaFile.findUnique({ where: { storageKey } });
      if (existing) return existing.id;
    }
    throw e;
  }
}
