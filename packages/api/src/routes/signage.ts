import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { prisma } from "../db.js";

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

export const signageApp = new OpenAPIHono();

signageApp.openapi(getArticlesRoute, async (c) => {
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

signageApp.openapi(getRankingsRoute, async (c) => {
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
