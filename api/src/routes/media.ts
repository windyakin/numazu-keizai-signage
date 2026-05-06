import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

const ErrorResponseSchema = z.object({
  error: z.string(),
});

const proxyRoute = createRoute({
  method: "get",
  path: "/api/media/proxy",
  request: {
    query: z.object({
      url: z.string().url(),
    }),
  },
  responses: {
    200: {
      content: { "application/octet-stream": { schema: z.any() } },
      description: "プロキシされた画像データ",
    },
    400: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "不正なURL",
    },
    502: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "上流取得失敗",
    },
  },
});

export const mediaApp = new OpenAPIHono();

mediaApp.openapi(proxyRoute, async (c) => {
  const { url } = c.req.valid("query");

  let upstream: Response;
  try {
    upstream = await fetch(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch failed";
    return c.json({ error: message }, 502);
  }

  if (!upstream.ok) {
    return c.json({ error: `upstream ${upstream.status} ${upstream.statusText}` }, 502);
  }

  const contentType = upstream.headers.get("Content-Type") ?? "application/octet-stream";
  return new Response(upstream.body, {
    headers: { "Content-Type": contentType },
  });
});
