import { createMiddleware } from "hono/factory";
import { createHash, timingSafeEqual } from "node:crypto";

// edge ↔ api 間のサーバー間認証。共有シークレット (SIGNAGE_API_TOKEN) を
// `Authorization: Bearer <token>` で検証する。
//
// 未設定時は warn を一度出して素通りさせる (fail-open)。これは
// 「api 先行デプロイ → edge 更新 → env 投入」のどの段階でもサービスを
// 止めないための移行用挙動。本番では entrypoint で env を必須化して
// 実質 fail-closed に倒すこと。

let warnedMissing = false;

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

// timingSafeEqual は長さ不一致で throw するため、双方を固定長の
// SHA-256 ダイジェストにしてから比較する。
function tokensMatch(presented: string, expected: string): boolean {
  return timingSafeEqual(sha256(presented), sha256(expected));
}

export const signageAuth = createMiddleware(async (c, next) => {
  const expected = process.env.SIGNAGE_API_TOKEN;

  if (!expected) {
    if (!warnedMissing) {
      console.warn(
        "[signageAuth] SIGNAGE_API_TOKEN is not set; signage endpoints are UNAUTHENTICATED",
      );
      warnedMissing = true;
    }
    return next();
  }

  const header = c.req.header("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/);
  if (!match || !tokensMatch(match[1], expected)) {
    return c.json({ error: "unauthorized" }, 401);
  }

  return next();
});
