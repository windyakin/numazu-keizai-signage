import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { prisma } from "../db.js";
import { fetchAccessRanking } from "../jobs/accessFetcher.js";

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

const getRankingsRoute = createRoute({
  method: "get",
  path: "/api/access/rankings",
  responses: {
    200: {
      content: { "application/json": { schema: RankingsResponseSchema } },
      description: "キャッシュ済みアクセスランキング",
    },
  },
});

const refreshRoute = createRoute({
  method: "post",
  path: "/api/access/refresh",
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

export const accessApp = new OpenAPIHono();

accessApp.openapi(getRankingsRoute, async (c) => {
  const rankings = await prisma.accessRanking.findMany({
    orderBy: { rank: "asc" },
  });

  const fetchedAt = rankings.length > 0 ? rankings[0].fetchedAt.toISOString() : null;

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

accessApp.openapi(refreshRoute, async (c) => {
  try {
    const fetched = await fetchAccessRanking();
    return c.json({ fetched });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});
