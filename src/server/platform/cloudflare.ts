import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import type { BlobStore, Platform } from "./types";

export interface CloudflareEnv {
  DB: D1Database;
  BLOBS: R2Bucket;
  ASSETS: Fetcher;
  APP_HOST: string;
  APP_URL: string;
  AUTH_SECRET: string;
  SAFE_BROWSING_KEY?: string;
  METRICS_TOKEN?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM?: string;
  SMTP_SECURE?: string;
}

function r2Store(bucket: R2Bucket): BlobStore {
  return {
    async put(key, body, contentType) {
      await bucket.put(key, body, { httpMetadata: { contentType } });
    },
    async get(key) {
      const obj = await bucket.get(key);
      if (!obj) return null;
      return { body: obj.body, contentType: obj.httpMetadata?.contentType ?? "application/octet-stream" };
    },
    async delete(key) {
      await bucket.delete(key);
    },
  };
}

export function cloudflarePlatform(env: CloudflareEnv, ctx: ExecutionContext): Platform {
  return {
    name: "cloudflare",
    db: drizzle(env.DB, { schema }),
    blobs: r2Store(env.BLOBS),
    mailer: null, // wired by the mail module when SMTP_* is set
    config: {
      appHost: env.APP_HOST,
      appUrl: env.APP_URL,
      authSecret: env.AUTH_SECRET,
      safeBrowsingKey: env.SAFE_BROWSING_KEY,
      metricsToken: env.METRICS_TOKEN,
    },
    geo(req) {
      const cf = (req as Request & { cf?: IncomingRequestCfProperties }).cf;
      return { country: cf?.country as string | undefined, region: cf?.region, city: cf?.city };
    },
    clientIp(req) {
      return req.headers.get("cf-connecting-ip");
    },
    waitUntil(p) {
      ctx.waitUntil(p);
    },
  };
}
