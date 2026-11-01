import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { smtpFromEnv } from "./smtp-env";
import type { BlobStore, Mailer, Platform, SmtpConfig } from "./types";

export interface CloudflareEnv {
  DB: D1Database;
  BLOBS: R2Bucket;
  ASSETS: Fetcher;
  APP_HOST: string;
  APP_URL: string;
  AUTH_SECRET: string;
  SAFE_BROWSING_KEY?: string;
  METRICS_TOKEN?: string;
  /** "1" only in the test environment: enables /api/_test helpers. */
  TEST_MODE?: string;
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

function workerMailer(smtp: SmtpConfig): Mailer {
  return {
    async send(mail) {
      const { WorkerMailer } = await import("worker-mailer");
      await WorkerMailer.send(
        {
          host: smtp.host,
          port: smtp.port,
          secure: smtp.tls === "ssl",
          startTls: smtp.tls === "starttls",
          credentials: smtp.user ? { username: smtp.user, password: smtp.pass ?? "" } : undefined,
        },
        { from: smtp.from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html },
      );
    },
  };
}

export function cloudflarePlatform(env: CloudflareEnv, ctx: ExecutionContext): Platform {
  return {
    name: "cloudflare",
    db: drizzle(env.DB, { schema }),
    blobs: r2Store(env.BLOBS),
    mailer: null, // resolved on demand by getMailer() in src/server/mail
    createSmtpMailer: workerMailer,
    config: {
      appHost: env.APP_HOST,
      appUrl: env.APP_URL,
      authSecret: env.AUTH_SECRET,
      safeBrowsingKey: env.SAFE_BROWSING_KEY,
      metricsToken: env.METRICS_TOKEN,
      testMode: env.TEST_MODE === "1",
      smtp: smtpFromEnv(env),
    },
    geo(req) {
      // Test mode never trusts the (local, real) cf data: geo comes only from the test headers.
      if (env.TEST_MODE === "1") {
        return {
          country: req.headers.get("x-test-country") ?? undefined,
          city: req.headers.get("x-test-city") ?? undefined,
        };
      }
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
