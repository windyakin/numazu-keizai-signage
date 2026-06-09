import { serve } from "@hono/node-server";
import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import { signageApp } from "./routes/signage.js";
import { adminApp } from "./routes/admin.js";
import { mediaApp } from "./routes/media.js";
import { authApp } from "./routes/auth.js";
import { adminAuth } from "./middleware/adminAuth.js";
import { startArticlesJob } from "./jobs/articlesFetcher.js";
import { startRankingsJob } from "./jobs/rankingsFetcher.js";
import { startWeatherJob } from "./jobs/weatherFetcher.js";

const app = new OpenAPIHono();

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/", signageApp);
app.route("/", authApp);
// /api/admin/* は Auth0 セッション Cookie で保護する (adminApp のマウント前に登録)。
app.use("/api/admin/*", adminAuth);
app.route("/", adminApp);
app.route("/", mediaApp);

app.doc("/doc/json", {
  openapi: "3.0.0",
  info: { title: "Numazu Keizai Signage API", version: "0.1.0" },
});

app.get("/doc", swaggerUI({ url: "/doc/json" }));

const port = parseInt(process.env.PORT || "3000", 10);

serve({ fetch: app.fetch, port }, () => {
  console.log(`API server running on port ${port}`);
  startArticlesJob();
  startRankingsJob();
  startWeatherJob();
});
