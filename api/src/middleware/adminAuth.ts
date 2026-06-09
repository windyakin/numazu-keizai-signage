import { createMiddleware } from "hono/factory";
import { getAuth } from "@hono/oidc-auth";

// admin 画面 ↔ api 間の認証。Auth0 を OIDC プロバイダとして扱い、
// 認可コードフローで発行した暗号化セッション Cookie を検証する。
//
// signageAuth と同様、設定が無い間は warn を一度出して素通りさせる
// (fail-open)。これは「api 先行デプロイ → Auth0 構築 → env 投入」の
// どの段階でもサービスを止めないための移行用挙動。
//
// oidcAuthMiddleware() は未認証時に IdP へ 302 リダイレクトするが、
// /api/admin/* は fetch / XHR / <img> から叩かれるためリダイレクトは
// 不都合。ここでは getAuth() でセッションを検証し、未認証なら 401 を返す
// (リダイレクトはログイン起点の /api/auth/login のみで行う)。

let warnedMissing = false;

const REQUIRED_OIDC_ENVS = [
  "OIDC_ISSUER",
  "OIDC_CLIENT_ID",
  "OIDC_CLIENT_SECRET",
  "OIDC_AUTH_SECRET",
] as const;

// OIDC の必須 env が揃っているか。auth ルートと adminAuth で共用する。
export function oidcConfigured(): boolean {
  return REQUIRED_OIDC_ENVS.every((k) => !!process.env[k]);
}

export const adminAuth = createMiddleware(async (c, next) => {
  if (!oidcConfigured()) {
    if (!warnedMissing) {
      console.warn(
        "[adminAuth] OIDC env (OIDC_ISSUER/CLIENT_ID/CLIENT_SECRET/AUTH_SECRET) is not set; /api/admin/* endpoints are UNAUTHENTICATED",
      );
      warnedMissing = true;
    }
    return next();
  }

  const auth = await getAuth(c);
  if (!auth) {
    return c.json({ error: "unauthorized" }, 401);
  }

  return next();
});
