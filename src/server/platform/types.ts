import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema";

/**
 * Database handle. D1 is async and better-sqlite3 is sync, but every query builder is awaitable on
 * both, so the Node platform hands out its handle under this type. Use `runBatch` (src/server/db/batch.ts)
 * instead of `db.batch`, which only exists on D1.
 */
export type DB = DrizzleD1Database<typeof schema>;

export interface BlobStore {
  put(key: string, body: ArrayBuffer | Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: ReadableStream | ArrayBuffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export interface Geo {
  country?: string;
  region?: string;
  city?: string;
}

/** SMTP settings, from the environment or the settings screen. */
export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
  /** none = plain, starttls = upgrade after connect, ssl = TLS from the start. */
  tls: "none" | "starttls" | "ssl";
}

/** Runtime configuration shared by every platform. */
export interface Config {
  /** Host serving the admin app and API, e.g. "hop.example.com". */
  appHost: string;
  /** Public base URL of the admin app, e.g. "https://hop.example.com". */
  appUrl: string;
  authSecret: string;
  /** Optional Google Safe Browsing API key (J6). */
  safeBrowsingKey?: string;
  /** Optional bearer token protecting /metrics. */
  metricsToken?: string;
  /** True only in the dedicated test environment. */
  testMode: boolean;
  /** SMTP from environment variables (the settings screen takes precedence). */
  smtp?: SmtpConfig;
}

/** Everything the app needs from the runtime. */
export interface Platform {
  name: "cloudflare" | "node";
  db: DB;
  blobs: BlobStore;
  /** Always null on creation: resolve it with `getMailer(platform)` from `src/server/mail`. */
  mailer: Mailer | null;
  /** Sends mail over SMTP with the platform's own client (worker-mailer on Workers, nodemailer on Node). */
  createSmtpMailer(smtp: SmtpConfig): Mailer;
  config: Config;
  geo(req: Request): Geo;
  clientIp(req: Request): string | null;
  waitUntil(p: Promise<unknown>): void;
}
