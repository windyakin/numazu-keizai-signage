import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  getAuth,
  oidcAuthMiddleware,
  processOAuthCallback,
  revokeSession,
  type OidcClaimsHook,
} from "@hono/oidc-auth";
import { oidcConfigured } from "../middleware/adminAuth.js";

// Auth0 (OIDC) 認可コードフローのエンドポイント群。
// セッションは @hono/oidc-auth が暗号化 Cookie に保持する (サーバー側
// セッションストア不要)。admin と api は同一オリジンのため Cookie は
// fetch / XHR / <img> すべてに自動付与される。
//
// login / callback / logout はブラウザリダイレクト用なので OpenAPI には
// 載せない (素の get/post)。JSON を返す /me のみ createRoute で定義する。

export const authApp = new OpenAPIHono();

const ErrorResponseSchema = z.object({ error: z.string() });

// ログイン後・ログアウト後の戻り先。prod は nginx 配信パス (例: /admin/)。
function adminBaseUrl(): string {
  return process.env.ADMIN_BASE_URL || "/";
}

// セッションに保持するクレーム。email/sub に加えて name を取り込む。
const claimsHook: OidcClaimsHook = async (orig, claims) => ({
  sub: claims?.sub ?? orig?.sub ?? "",
  email: (claims?.email as string | undefined) ?? orig?.email ?? "",
  name:
    (claims?.name as string | undefined) ??
    (orig?.name as string | undefined) ??
    "",
});

// GET /api/auth/login — 未認証なら oidcAuthMiddleware が Auth0 へ飛ばす。
// 認証済みなら admin トップへ戻す。OIDC 未設定時はそのまま admin へ。
authApp.use("/api/auth/login", async (c, next) => {
  if (!oidcConfigured()) return c.redirect(adminBaseUrl());
  return oidcAuthMiddleware()(c, next);
});
authApp.get("/api/auth/login", (c) => c.redirect(adminBaseUrl()));

// GET /api/auth/callback — Auth0 からのリダイレクトを受けてトークン交換
// + セッション Cookie 発行。OIDC_REDIRECT_URI のパスと一致させること。
authApp.get("/api/auth/callback", async (c) => {
  if (!oidcConfigured()) return c.redirect(adminBaseUrl());
  c.set("oidcClaimsHook", claimsHook);
  return processOAuthCallback(c);
});

// ログアウト。GET はリンク用 (admin へリダイレクト)、POST は fetch 用。
authApp.get("/api/auth/logout", async (c) => {
  if (oidcConfigured()) await revokeSession(c);
  return c.redirect(adminBaseUrl());
});
authApp.post("/api/auth/logout", async (c) => {
  if (oidcConfigured()) await revokeSession(c);
  return c.json({ ok: true });
});

// GET /api/auth/me — フロントの起動時ゲート用。
const MeUserSchema = z.object({
  sub: z.string(),
  email: z.string().nullable(),
  name: z.string().nullable(),
});

const MeResponseSchema = z.object({
  enabled: z.boolean(),
  user: MeUserSchema.optional(),
});

const meRoute = createRoute({
  method: "get",
  path: "/api/auth/me",
  responses: {
    200: {
      content: { "application/json": { schema: MeResponseSchema } },
      description:
        "認証状態。enabled=false は認証無効(fail-open)、user 有りはログイン済み",
    },
    401: {
      content: { "application/json": { schema: ErrorResponseSchema } },
      description: "認証は有効だが未ログイン",
    },
  },
});

authApp.openapi(meRoute, async (c) => {
  if (!oidcConfigured()) {
    return c.json({ enabled: false }, 200);
  }
  const auth = await getAuth(c);
  if (!auth) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return c.json(
    {
      enabled: true,
      user: {
        sub: auth.sub ?? "",
        email: auth.email ?? null,
        name: (auth.name as string | undefined) ?? null,
      },
    },
    200,
  );
});
