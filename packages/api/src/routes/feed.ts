import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { prisma } from "../db.js";
import { fetchFeed } from "../jobs/feedFetcher.js";

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

const RefreshResponseSchema = z.object({
  fetched: z.number(),
});

const ErrorResponseSchema = z.object({
  error: z.string(),
});

const getArticlesRoute = createRoute({
  method: "get",
  path: "/api/feed/articles",
  responses: {
    200: {
      content: { "application/json": { schema: ArticlesResponseSchema } },
      description: "キャッシュ済み記事一覧",
    },
  },
});

const refreshRoute = createRoute({
  method: "post",
  path: "/api/feed/refresh",
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

export const feedApp = new OpenAPIHono();

feedApp.openapi(getArticlesRoute, async (c) => {
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

feedApp.openapi(refreshRoute, async (c) => {
  try {
    const fetched = await fetchFeed();
    return c.json({ fetched });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});
