import { createMiddleware } from "hono/factory";
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "../db.js";
import type { Device } from "../generated/prisma/client.js";

// edge ↔ api 間のサーバー間認証。`Authorization: Bearer <token>` を検証する。
//
// 1. トークンの SHA-256 が Device.tokenHash に一致すればデバイストークンとして
//    認証し、該当 Device をコンテキスト変数 `device` に載せる（識別子 = トークン）。
// 2. 一致しなければ共有シークレット (SIGNAGE_API_TOKEN) と比較する（レガシー・
//    デバイス未登録の edge 用）。この場合 `device` は null のまま。
//
// SIGNAGE_API_TOKEN 未設定時は warn を一度出して素通りさせる (fail-open)。これは
// 「api 先行デプロイ → edge 更新 → env 投入」のどの段階でもサービスを
// 止めないための移行用挙動。本番では entrypoint で env を必須化して
// 実質 fail-closed に倒すこと。

export type SignageAuthEnv = {
  Variables: {
    device: Device | null;
  };
};

let warnedMissing = false;

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// timingSafeEqual は長さ不一致で throw するため、双方を固定長の
// SHA-256 ダイジェストにしてから比較する。
function tokensMatch(presented: string, expected: string): boolean {
  return timingSafeEqual(sha256(presented), sha256(expected));
}

export const signageAuth = createMiddleware<SignageAuthEnv>(async (c, next) => {
  c.set("device", null);

  const header = c.req.header("Authorization") ?? "";
  const presented = header.match(/^Bearer\s+(.+)$/)?.[1];

  if (presented) {
    const device = await prisma.device.findUnique({
      where: { tokenHash: sha256Hex(presented) },
    });
    if (device) {
      c.set("device", device);
      return next();
    }
  }

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

  if (!presented || !tokensMatch(presented, expected)) {
    return c.json({ error: "unauthorized" }, 401);
  }

  return next();
});
