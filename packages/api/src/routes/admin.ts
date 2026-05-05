import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { prisma } from "../db.js";
import { fetchFeed } from "../jobs/feedFetcher.js";
import { fetchAccessRanking } from "../jobs/accessFetcher.js";

const ArticleSchema = z.object({
  id: z.string(),
  title: z.string(),
  imageUrl: z.string(),
  description: z.string().nullable(),
  start: z.string(),
});

const ArticlesResponseSchema = z.object({
  articles: z.array(ArticleSchema),
});

const RankingItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  imageUrl: z.string(),
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

const refreshFeedRoute = createRoute({
  method: "post",
  path: "/api/admin/feed/refresh",
  responses: {
    200: {
      content: { "application/json": { schema: RefreshResponseSchema } },
      description: "フィード再取得結果",
    },
    500: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "エラー",
    },
  },
});

const refreshRankingsRoute = createRoute({
  method: "post",
  path: "/api/admin/access/refresh",
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

export const adminApp = new OpenAPIHono();

adminApp.openapi(getArticlesRoute, async (c) => {
  const articles = await prisma.article.findMany({
    orderBy: { start: "desc" },
  });

  return c.json({
    articles: articles.map((a) => ({
      id: a.id,
      title: a.title,
      imageUrl: a.imageUrl,
      description: a.description,
      start: a.start.toISOString(),
    })),
  });
});

adminApp.openapi(getRankingsRoute, async (c) => {
  const rankings = await prisma.accessRanking.findMany({
    orderBy: { rank: "asc" },
  });

  const fetchedAt =
    rankings.length > 0 ? rankings[0].fetchedAt.toISOString() : null;

  return c.json({
    rankings: rankings.map((r) => ({
      id: r.id,
      title: r.title,
      imageUrl: r.imageUrl,
      rank: r.rank,
      start: r.start.toISOString(),
    })),
    fetchedAt,
  });
});

adminApp.openapi(refreshFeedRoute, async (c) => {
  try {
    const fetched = await fetchFeed();
    return c.json({ fetched }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

adminApp.openapi(refreshRankingsRoute, async (c) => {
  try {
    const fetched = await fetchAccessRanking();
    return c.json({ fetched }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});
