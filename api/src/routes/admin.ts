import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";
import { fetchArticles } from "../jobs/articlesFetcher.js";
import { fetchRankings } from "../jobs/rankingsFetcher.js";
import {
  createStorageClient,
  deleteObject,
  getObject,
  uploadObject,
  getPublicUrl,
} from "../storage.js";

// Schemas

const ArticleSchema = z.object({
  id: z.string(),
  title: z.string(),
  imageKey: z.string().nullable(),
  description: z.string().nullable(),
  start: z.string(),
});

const ArticlesResponseSchema = z.object({
  articles: z.array(ArticleSchema),
});

const RankingItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  imageKey: z.string().nullable(),
  rank: z.number(),
  start: z.string(),
});

const RankingsResponseSchema = z.object({
  rankings: z.array(RankingItemSchema),
  fetchedAt: z.string().nullable(),
});

const RefreshResponseSchema = z.object({
  fetched: z.number(),
});

const ErrorResponseSchema = z.object({
  error: z.string(),
});

// Media Schemas

const MediaFileSchema = z.object({
  id: z.string(),
  storageKey: z.string(),
  url: z.string(),
  mimeType: z.string(),
  type: z.enum(["IMAGE", "VIDEO", "ARTICLE"]),
  originalName: z.string(),
  sizeBytes: z.string().nullable(),
  uploadedAt: z.string(),
  playlistItemCount: z.number(),
});

const MediaListResponseSchema = z.object({
  files: z.array(MediaFileSchema),
});

// Playlist Schemas

const PlaylistItemTypeSchema = z.enum([
  "ARTICLE_LATEST",
  "ARTICLE_RANDOM",
  "RANKING",
  "IMAGE",
  "VIDEO",
]);

const PlaylistItemSchema = z.object({
  id: z.string(),
  type: PlaylistItemTypeSchema,
  order: z.number(),
  durationSec: z.number().nullable(),
  isFullscreen: z.boolean(),
  mediaFile: z
    .object({
      id: z.string(),
      url: z.string(),
      mimeType: z.string(),
      originalName: z.string(),
    })
    .nullable(),
});

const PlaylistSchema = z.object({
  id: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  itemCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const PlaylistsResponseSchema = z.object({ playlists: z.array(PlaylistSchema) });
const PlaylistItemsResponseSchema = z.object({ items: z.array(PlaylistItemSchema) });
const CreatePlaylistRequestSchema = z.object({ name: z.string().min(1) });
const RenamePlaylistRequestSchema = z.object({ name: z.string().min(1) });
const ReorderPlaylistRequestSchema = z.object({ ids: z.array(z.string()) });

const CreatePlaylistItemRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ARTICLE_LATEST"), durationSec: z.number().int().positive() }),
  z.object({ type: z.literal("ARTICLE_RANDOM"), durationSec: z.number().int().positive() }),
  z.object({ type: z.literal("RANKING"),        durationSec: z.number().int().positive() }),
  z.object({ type: z.literal("IMAGE"),          durationSec: z.number().int().positive(), mediaFileId: z.string(), isFullscreen: z.boolean().optional() }),
  z.object({ type: z.literal("VIDEO"),          durationSec: z.number().int().positive().nullable().optional(), mediaFileId: z.string(), isFullscreen: z.boolean().optional() }),
]);

const UpdatePlaylistItemRequestSchema = z.object({
  durationSec: z.number().int().positive().nullable().optional(),
  isFullscreen: z.boolean().optional(),
});

// Routes

const getArticlesRoute = createRoute({
  method: "get",
  path: "/api/admin/articles",
  responses: {
    200: {
      content: { "application/json": { schema: ArticlesResponseSchema } },
      description: "管理用記事一覧",
    },
  },
});

const getRankingsRoute = createRoute({
  method: "get",
  path: "/api/admin/rankings",
  responses: {
    200: {
      content: { "application/json": { schema: RankingsResponseSchema } },
      description: "管理用アクセスランキング",
    },
  },
});

const refreshArticlesRoute = createRoute({
  method: "post",
  path: "/api/admin/articles/refresh",
  responses: {
    200: {
      content: { "application/json": { schema: RefreshResponseSchema } },
      description: "記事再取得結果",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "エラー",
    },
  },
});

const refreshRankingsRoute = createRoute({
  method: "post",
  path: "/api/admin/rankings/refresh",
  responses: {
    200: {
      content: { "application/json": { schema: RefreshResponseSchema } },
      description: "ランキング再取得結果",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "エラー",
    },
  },
});

const getMediaRoute = createRoute({
  method: "get",
  path: "/api/admin/media",
  responses: {
    200: {
      content: { "application/json": { schema: MediaListResponseSchema } },
      description: "メディアファイル一覧",
    },
  },
});

const uploadMediaRoute = createRoute({
  method: "post",
  path: "/api/admin/media/upload",
  responses: {
    201: {
      content: { "application/json": { schema: MediaFileSchema } },
      description: "アップロード済みメディアファイル",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "バリデーションエラー",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "エラー",
    },
  },
});

const deleteMediaRoute = createRoute({
  method: "delete",
  path: "/api/admin/media/{id}",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    204: { description: "削除完了" },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "未発見",
    },
    409: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "プレイリストで使用中のため削除不可",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "エラー",
    },
  },
});

const getMediaContentRoute = createRoute({
  method: "get",
  path: "/api/admin/media/{id}/content",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      content: { "application/octet-stream": { schema: z.any() } },
      description: "メディアファイル本体",
    },
    404: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "未発見",
    },
    502: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "ストレージ取得失敗",
    },
  },
});

// Playlist routes

const getPlaylistsRoute = createRoute({
  method: "get",
  path: "/api/admin/playlists",
  responses: {
    200: { content: { "application/json": { schema: PlaylistsResponseSchema } }, description: "プレイリスト一覧" },
  },
});

const createPlaylistRoute = createRoute({
  method: "post",
  path: "/api/admin/playlists",
  request: { body: { content: { "application/json": { schema: CreatePlaylistRequestSchema } } } },
  responses: {
    201: { content: { "application/json": { schema: PlaylistSchema } }, description: "作成したプレイリスト" },
  },
});

const renamePlaylistRoute = createRoute({
  method: "patch",
  path: "/api/admin/playlists/{id}",
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: RenamePlaylistRequestSchema } } },
  },
  responses: {
    200: { content: { "application/json": { schema: PlaylistSchema } }, description: "更新済みプレイリスト" },
    404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "未発見" },
  },
});

const deletePlaylistRoute = createRoute({
  method: "delete",
  path: "/api/admin/playlists/{id}",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    204: { description: "削除完了" },
    404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "未発見" },
    409: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "アクティブなプレイリストは削除不可" },
  },
});

const activatePlaylistRoute = createRoute({
  method: "put",
  path: "/api/admin/playlists/{id}/activate",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { content: { "application/json": { schema: PlaylistSchema } }, description: "アクティブにしたプレイリスト" },
    404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "未発見" },
  },
});

// Playlist item routes

const getPlaylistItemsRoute = createRoute({
  method: "get",
  path: "/api/admin/playlists/{playlistId}/items",
  request: { params: z.object({ playlistId: z.string() }) },
  responses: {
    200: { content: { "application/json": { schema: PlaylistItemsResponseSchema } }, description: "プレイリストアイテム一覧" },
    404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "未発見" },
  },
});

const createPlaylistItemRoute = createRoute({
  method: "post",
  path: "/api/admin/playlists/{playlistId}/items",
  request: {
    params: z.object({ playlistId: z.string() }),
    body: { content: { "application/json": { schema: CreatePlaylistItemRequestSchema } } },
  },
  responses: {
    201: { content: { "application/json": { schema: PlaylistItemSchema } }, description: "追加したアイテム" },
    400: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "バリデーションエラー" },
    404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "未発見" },
  },
});

const updatePlaylistItemRoute = createRoute({
  method: "patch",
  path: "/api/admin/playlists/{playlistId}/items/{itemId}",
  request: {
    params: z.object({ playlistId: z.string(), itemId: z.string() }),
    body: { content: { "application/json": { schema: UpdatePlaylistItemRequestSchema } } },
  },
  responses: {
    200: { content: { "application/json": { schema: PlaylistItemSchema } }, description: "更新済みアイテム" },
    404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "未発見" },
  },
});

const deletePlaylistItemRoute = createRoute({
  method: "delete",
  path: "/api/admin/playlists/{playlistId}/items/{itemId}",
  request: { params: z.object({ playlistId: z.string(), itemId: z.string() }) },
  responses: {
    204: { description: "削除完了" },
    404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "未発見" },
  },
});

const reorderPlaylistItemsRoute = createRoute({
  method: "put",
  path: "/api/admin/playlists/{playlistId}/items/reorder",
  request: {
    params: z.object({ playlistId: z.string() }),
    body: { content: { "application/json": { schema: ReorderPlaylistRequestSchema } } },
  },
  responses: {
    200: { content: { "application/json": { schema: PlaylistItemsResponseSchema } }, description: "並び替え後のアイテム一覧" },
    404: { content: { "application/json": { schema: ErrorResponseSchema } }, description: "未発見" },
  },
});

// Handlers

export const adminApp = new OpenAPIHono();

adminApp.openapi(getArticlesRoute, async (c) => {
  const articles = await prisma.article.findMany({
    orderBy: { start: "desc" },
    include: { mediaFile: true },
  });

  return c.json({
    articles: articles.map((a) => ({
      id: a.id,
      title: a.title,
      imageKey: a.mediaFile?.storageKey ?? null,
      description: a.description,
      start: a.start.toISOString(),
    })),
  });
});

adminApp.openapi(getRankingsRoute, async (c) => {
  const rankings = await prisma.accessRanking.findMany({
    orderBy: { rank: "asc" },
    include: { article: { include: { mediaFile: true } } },
  });

  const fetchedAt =
    rankings.length > 0 ? rankings[0].fetchedAt.toISOString() : null;

  return c.json({
    rankings: rankings.map((r) => ({
      id: r.articleId,
      title: r.article.title,
      imageKey: r.article.mediaFile?.storageKey ?? null,
      rank: r.rank,
      start: r.article.start.toISOString(),
    })),
    fetchedAt,
  });
});

adminApp.openapi(refreshArticlesRoute, async (c) => {
  try {
    const fetched = await fetchArticles();
    return c.json({ fetched }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

adminApp.openapi(refreshRankingsRoute, async (c) => {
  try {
    const fetched = await fetchRankings();
    return c.json({ fetched }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

// Media handlers

adminApp.openapi(getMediaRoute, async (c) => {
  const files = await prisma.mediaFile.findMany({
    where: { type: { in: ["IMAGE", "VIDEO"] } },
    orderBy: { uploadedAt: "desc" },
    include: { _count: { select: { playlistItems: true } } },
  });

  return c.json({
    files: files.map((f) => ({
      id: f.id,
      storageKey: f.storageKey,
      url: getPublicUrl(f.storageKey),
      mimeType: f.mimeType,
      type: f.type,
      originalName: f.originalName,
      sizeBytes: f.sizeBytes?.toString() ?? null,
      uploadedAt: f.uploadedAt.toISOString(),
      playlistItemCount: f._count.playlistItems,
    })),
  });
});

adminApp.openapi(uploadMediaRoute, async (c) => {
  try {
    const formData = await c.req.formData();
    const fileField = formData.get("file");
    const typeField = formData.get("type");

    if (!(fileField instanceof File)) {
      return c.json({ error: "file is required" }, 400);
    }
    if (typeField !== "IMAGE" && typeField !== "VIDEO") {
      return c.json({ error: "type must be IMAGE or VIDEO" }, 400);
    }

    const originalName = fileField.name;
    const mimeType = fileField.type;
    const ext = originalName.includes(".")
      ? originalName.slice(originalName.lastIndexOf("."))
      : "";
    const storageKey = `uploads/${randomUUID()}${ext}`;
    const bucket = process.env.STORAGE_BUCKET ?? "signage-media";
    const client = createStorageClient();
    const buffer = Buffer.from(await fileField.arrayBuffer());

    await uploadObject(client, bucket, storageKey, buffer, mimeType);

    const record = await prisma.mediaFile.create({
      data: {
        storageKey,
        mimeType,
        type: typeField,
        originalName,
        sizeBytes: BigInt(fileField.size),
      },
    });

    return c.json(
      {
        id: record.id,
        storageKey: record.storageKey,
        url: getPublicUrl(record.storageKey),
        mimeType: record.mimeType,
        type: record.type,
        originalName: record.originalName,
        sizeBytes: record.sizeBytes?.toString() ?? null,
        uploadedAt: record.uploadedAt.toISOString(),
        playlistItemCount: 0,
      },
      201
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

adminApp.openapi(deleteMediaRoute, async (c) => {
  const { id } = c.req.valid("param");
  const file = await prisma.mediaFile.findUnique({
    where: { id },
    include: { _count: { select: { playlistItems: true } } },
  });
  if (!file) return c.json({ error: "Not found" }, 404);

  if (file._count.playlistItems > 0) {
    return c.json(
      { error: `プレイリストで使用中のため削除できません（${file._count.playlistItems}件）` },
      409,
    );
  }

  try {
    const bucket = process.env.STORAGE_BUCKET ?? "signage-media";
    const client = createStorageClient();
    await deleteObject(client, bucket, file.storageKey);
  } catch {
    // ストレージ削除失敗はログのみ（DBレコードは削除する）
    console.error(`Failed to delete storage object: ${file.storageKey}`);
  }

  await prisma.mediaFile.delete({ where: { id } });
  return new Response(null, { status: 204 });
});

adminApp.openapi(getMediaContentRoute, async (c) => {
  const { id } = c.req.valid("param");
  const file = await prisma.mediaFile.findUnique({ where: { id } });
  if (!file) return c.json({ error: "Not found" }, 404);

  try {
    const bucket = process.env.STORAGE_BUCKET ?? "signage-media";
    const client = createStorageClient();
    const { body } = await getObject(client, bucket, file.storageKey);
    return new Response(body, {
      headers: {
        "Content-Type": file.mimeType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch failed";
    return c.json({ error: message }, 502);
  }
});

// Playlist handlers

function serializePlaylistItem(item: {
  id: string;
  type: string;
  order: number;
  durationSec: number | null;
  isFullscreen: boolean;
  mediaFile: { id: string; storageKey: string; mimeType: string; originalName: string } | null;
}) {
  return {
    id: item.id,
    type: item.type as z.infer<typeof PlaylistItemTypeSchema>,
    order: item.order,
    durationSec: item.durationSec,
    isFullscreen: item.isFullscreen,
    mediaFile: item.mediaFile
      ? { id: item.mediaFile.id, url: getPublicUrl(item.mediaFile.storageKey), mimeType: item.mediaFile.mimeType, originalName: item.mediaFile.originalName }
      : null,
  };
}

function serializePlaylist(pl: { id: string; name: string; isActive: boolean; createdAt: Date; updatedAt: Date; _count: { items: number } }) {
  return {
    id: pl.id,
    name: pl.name,
    isActive: pl.isActive,
    itemCount: pl._count.items,
    createdAt: pl.createdAt.toISOString(),
    updatedAt: pl.updatedAt.toISOString(),
  };
}

adminApp.openapi(getPlaylistsRoute, async (c) => {
  const playlists = await prisma.playlist.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { items: true } } },
  });
  return c.json({ playlists: playlists.map(serializePlaylist) });
});

adminApp.openapi(createPlaylistRoute, async (c) => {
  const { name } = c.req.valid("json");
  const pl = await prisma.playlist.create({
    data: { name },
    include: { _count: { select: { items: true } } },
  });
  return c.json(serializePlaylist(pl), 201);
});

adminApp.openapi(renamePlaylistRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { name } = c.req.valid("json");
  const existing = await prisma.playlist.findUnique({ where: { id } });
  if (!existing) return c.json({ error: "Not found" }, 404) as never;
  const pl = await prisma.playlist.update({
    where: { id },
    data: { name },
    include: { _count: { select: { items: true } } },
  });
  return c.json(serializePlaylist(pl), 200);
});

adminApp.openapi(deletePlaylistRoute, async (c) => {
  const { id } = c.req.valid("param");
  const existing = await prisma.playlist.findUnique({ where: { id } });
  if (!existing) return c.json({ error: "Not found" }, 404) as never;
  if (existing.isActive) return c.json({ error: "アクティブなプレイリストは削除できません" }, 409) as never;
  await prisma.playlist.delete({ where: { id } });
  return new Response(null, { status: 204 });
});

adminApp.openapi(activatePlaylistRoute, async (c) => {
  const { id } = c.req.valid("param");
  const existing = await prisma.playlist.findUnique({ where: { id } });
  if (!existing) return c.json({ error: "Not found" }, 404) as never;
  const [, pl] = await prisma.$transaction([
    prisma.playlist.updateMany({ where: { isActive: true }, data: { isActive: false } }),
    prisma.playlist.update({ where: { id }, data: { isActive: true }, include: { _count: { select: { items: true } } } }),
  ]);
  return c.json(serializePlaylist(pl), 200);
});

// Playlist item handlers

adminApp.openapi(getPlaylistItemsRoute, async (c) => {
  const { playlistId } = c.req.valid("param");
  const pl = await prisma.playlist.findUnique({ where: { id: playlistId } });
  if (!pl) return c.json({ error: "Not found" }, 404) as never;
  const items = await prisma.playlistItem.findMany({
    where: { playlistId },
    orderBy: { order: "asc" },
    include: { mediaFile: true },
  });
  return c.json({ items: items.map(serializePlaylistItem) }, 200);
});

adminApp.openapi(createPlaylistItemRoute, async (c) => {
  const { playlistId } = c.req.valid("param");
  const body = c.req.valid("json");
  const pl = await prisma.playlist.findUnique({ where: { id: playlistId } });
  if (!pl) return c.json({ error: "Not found" }, 404) as never;
  if ((body.type === "IMAGE" || body.type === "VIDEO") && "mediaFileId" in body) {
    const exists = await prisma.mediaFile.findUnique({ where: { id: body.mediaFileId } });
    if (!exists) return c.json({ error: "mediaFileId not found" }, 400) as never;
  }
  const maxOrder = await prisma.playlistItem.aggregate({ where: { playlistId }, _max: { order: true } });
  const nextOrder = (maxOrder._max.order ?? 0) + 1;
  const item = await prisma.playlistItem.create({
    data: {
      playlistId,
      type: body.type,
      order: nextOrder,
      durationSec: body.durationSec ?? null,
      mediaFileId: "mediaFileId" in body ? (body.mediaFileId as string) : null,
      isFullscreen: "isFullscreen" in body ? body.isFullscreen ?? false : false,
    },
    include: { mediaFile: true },
  });
  return c.json(serializePlaylistItem(item), 201);
});

adminApp.openapi(updatePlaylistItemRoute, async (c) => {
  const { playlistId, itemId } = c.req.valid("param");
  const { durationSec, isFullscreen } = c.req.valid("json");
  const existing = await prisma.playlistItem.findUnique({ where: { id: itemId, playlistId } });
  if (!existing) return c.json({ error: "Not found" }, 404) as never;
  const data: { durationSec?: number | null; isFullscreen?: boolean } = {};
  if (durationSec !== undefined) data.durationSec = durationSec;
  if (isFullscreen !== undefined) data.isFullscreen = isFullscreen;
  const item = await prisma.playlistItem.update({
    where: { id: itemId },
    data,
    include: { mediaFile: true },
  });
  return c.json(serializePlaylistItem(item), 200);
});

adminApp.openapi(deletePlaylistItemRoute, async (c) => {
  const { playlistId, itemId } = c.req.valid("param");
  const existing = await prisma.playlistItem.findUnique({ where: { id: itemId, playlistId } });
  if (!existing) return c.json({ error: "Not found" }, 404) as never;
  await prisma.playlistItem.delete({ where: { id: itemId } });
  return new Response(null, { status: 204 });
});

adminApp.openapi(reorderPlaylistItemsRoute, async (c) => {
  const { playlistId } = c.req.valid("param");
  const { ids } = c.req.valid("json");
  const pl = await prisma.playlist.findUnique({ where: { id: playlistId } });
  if (!pl) return c.json({ error: "Not found" }, 404) as never;
  await prisma.$transaction(
    ids.map((id, index) => prisma.playlistItem.update({ where: { id }, data: { order: index + 1 } }))
  );
  const items = await prisma.playlistItem.findMany({
    where: { playlistId },
    orderBy: { order: "asc" },
    include: { mediaFile: true },
  });
  return c.json({ items: items.map(serializePlaylistItem) }, 200);
});
