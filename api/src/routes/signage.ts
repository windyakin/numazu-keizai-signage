import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import QRCode from "qrcode";
import { prisma } from "../db.js";
import { createStorageClient, getObject } from "../storage.js";
import { buildArticleUrl, qrKeyForUrl } from "../qr.js";

// Schemas

const ArticleSchema = z.object({
  id: z.string(),
  title: z.string(),
  imageKey: z.string().nullable(),
  qrKey: z.string().nullable(),
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

// Playlist Schemas

const MediaPayloadSchema = z.object({
  storageKey: z.string(),
  mimeType: z.string(),
  isFullscreen: z.boolean(),
});

const PlaylistItemSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string(),
    type: z.literal("ARTICLE_LATEST"),
    order: z.number(),
    durationSec: z.number().nullable(),
    payload: z.null(),
  }),
  z.object({
    id: z.string(),
    type: z.literal("ARTICLE_RANDOM"),
    order: z.number(),
    durationSec: z.number().nullable(),
    payload: z.null(),
  }),
  z.object({
    id: z.string(),
    type: z.literal("RANKING"),
    order: z.number(),
    durationSec: z.number().nullable(),
    payload: z.null(),
  }),
  z.object({
    id: z.string(),
    type: z.literal("IMAGE"),
    order: z.number(),
    durationSec: z.number().nullable(),
    payload: MediaPayloadSchema.nullable(),
  }),
  z.object({
    id: z.string(),
    type: z.literal("VIDEO"),
    order: z.number(),
    durationSec: z.number().nullable(),
    payload: MediaPayloadSchema.nullable(),
  }),
]);

const PlaylistResponseSchema = z.object({
  id: z.string(),
  items: z.array(PlaylistItemSchema),
});

// Routes

const getArticlesRoute = createRoute({
  method: "get",
  path: "/api/signage/articles",
  responses: {
    200: {
      content: { "application/json": { schema: ArticlesResponseSchema } },
      description: "サイネージ表示用記事一覧",
    },
  },
});

const getRankingsRoute = createRoute({
  method: "get",
  path: "/api/signage/rankings",
  responses: {
    200: {
      content: { "application/json": { schema: RankingsResponseSchema } },
      description: "サイネージ表示用アクセスランキング",
    },
  },
});

const getPlaylistRoute = createRoute({
  method: "get",
  path: "/api/signage/playlist",
  responses: {
    200: {
      content: { "application/json": { schema: PlaylistResponseSchema } },
      description: "サイネージ表示用プレイリスト",
    },
  },
});

const getQrcodeRoute = createRoute({
  method: "get",
  path: "/api/signage/qrcode",
  request: {
    query: z.object({ url: z.string().url() }),
  },
  responses: {
    200: {
      content: { "image/png": { schema: z.any() } },
      description: "指定 URL の QR コード PNG",
    },
    400: {
      content: { "application/json": { schema: z.object({ error: z.string() }) } },
      description: "QR 生成に失敗",
    },
  },
});

// Handlers

export const signageApp = new OpenAPIHono();

signageApp.openapi(getArticlesRoute, async (c) => {
  const articles = await prisma.article.findMany({
    orderBy: { start: "desc" },
    take: 15,
    include: { mediaFile: true },
  });

  return c.json({
    articles: articles.map((a) => {
      const url = buildArticleUrl(a.id);
      return {
        id: a.id,
        title: a.title,
        imageKey: a.mediaFile?.storageKey ?? null,
        qrKey: url ? qrKeyForUrl(url) : null,
        description: a.description,
        start: a.start.toISOString(),
      };
    }),
  });
});

signageApp.openapi(getRankingsRoute, async (c) => {
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

signageApp.openapi(getPlaylistRoute, async (c) => {
  const playlist = await prisma.playlist.findFirst({
    where: { isActive: true },
    include: {
      items: { orderBy: { order: "asc" }, include: { mediaFile: true } },
    },
  });

  if (!playlist) {
    const fallback = [
      { id: "__fb_ar_1", type: "ARTICLE_RANDOM" as const, order: 1, durationSec: 8, payload: null },
      { id: "__fb_ar_2", type: "ARTICLE_RANDOM" as const, order: 2, durationSec: 8, payload: null },
      { id: "__fb_ar_3", type: "ARTICLE_RANDOM" as const, order: 3, durationSec: 8, payload: null },
      { id: "__fb_ar_4", type: "ARTICLE_RANDOM" as const, order: 4, durationSec: 8, payload: null },
      { id: "__fb_ar_5", type: "ARTICLE_RANDOM" as const, order: 5, durationSec: 8, payload: null },
      { id: "__fb_rk",   type: "RANKING"        as const, order: 6, durationSec: 16, payload: null },
    ];
    return c.json({ id: "__fb_default", items: fallback });
  }

  const items = playlist.items.map((item) => {
    const base = { id: item.id, order: item.order, durationSec: item.durationSec };

    switch (item.type) {
      case "ARTICLE_LATEST":
        return { ...base, type: "ARTICLE_LATEST" as const, payload: null };
      case "ARTICLE_RANDOM":
        return { ...base, type: "ARTICLE_RANDOM" as const, payload: null };
      case "RANKING":
        return { ...base, type: "RANKING" as const, payload: null };
      case "IMAGE":
        return {
          ...base,
          type: "IMAGE" as const,
          payload: item.mediaFile
            ? { storageKey: item.mediaFile.storageKey, mimeType: item.mediaFile.mimeType, isFullscreen: item.isFullscreen }
            : null,
        };
      case "VIDEO":
        return {
          ...base,
          type: "VIDEO" as const,
          payload: item.mediaFile
            ? { storageKey: item.mediaFile.storageKey, mimeType: item.mediaFile.mimeType, isFullscreen: item.isFullscreen }
            : null,
        };
    }
  });

  return c.json({ id: playlist.id, items });
});

// QR code (任意 URL をオンデマンド生成。edge が /api/signage/qrcode?url=... で取得しキャッシュする)

signageApp.openapi(getQrcodeRoute, async (c) => {
  const { url } = c.req.valid("query");
  try {
    const png = await QRCode.toBuffer(url, { type: "png", margin: 1, width: 512 });
    const body = new ArrayBuffer(png.byteLength);
    new Uint8Array(body).set(png);
    c.header("Content-Type", "image/png");
    c.header("Cache-Control", "public, max-age=31536000, immutable");
    return c.body(body, 200);
  } catch (e) {
    console.error(`[signage/qrcode] url=${url}`, e);
    return c.json({ error: "failed to generate qr code" }, 400);
  }
});

// Media proxy

const getMediaProxyRoute = createRoute({
  method: "get",
  path: "/api/signage/media",
  request: {
    query: z.object({ key: z.string().min(1) }),
  },
  responses: {
    200: {
      content: { "application/octet-stream": { schema: z.any() } },
      description: "ストレージオブジェクト",
    },
    404: {
      content: { "application/json": { schema: z.object({ error: z.string() }) } },
      description: "オブジェクトが見つからない",
    },
  },
});

signageApp.openapi(getMediaProxyRoute, async (c) => {
  const { key } = c.req.valid("query");
  const bucket = process.env.STORAGE_BUCKET ?? "";
  try {
    const { body, contentType } = await getObject(createStorageClient(), bucket, key);
    c.header("Content-Type", contentType);
    c.header("Cache-Control", "public, max-age=31536000, immutable");
    return c.body(body, 200);
  } catch (e) {
    console.error(`[signage/media] key=${key} bucket=${bucket}`, e);
    return c.json({ error: "not found" }, 404);
  }
});
