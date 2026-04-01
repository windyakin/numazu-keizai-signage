import { serve } from "@hono/node-server";
import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import { feedApp } from "./routes/feed.js";
import { startFeedJob } from "./jobs/feedFetcher.js";

const app = new OpenAPIHono();

app.route("/", feedApp);

app.doc("/doc/json", {
  openapi: "3.0.0",
  info: { title: "Numazu Keizai Signage API", version: "0.1.0" },
});

app.get("/doc", swaggerUI({ url: "/doc/json" }));

const port = parseInt(process.env.PORT || "3000", 10);

serve({ fetch: app.fetch, port }, () => {
  console.log(`API server running on port ${port}`);
  startFeedJob();
});
