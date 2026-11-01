import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema";

/** Database handle. Both D1 and better-sqlite3 expose the same async Drizzle API. */
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
}

/** Everything the app needs from the runtime. */
export interface Platform {
  name: "cloudflare" | "node";
  db: DB;
  blobs: BlobStore;
  /** Null when SMTP is not configured. */
  mailer: Mailer | null;
  config: Config;
  geo(req: Request): Geo;
  clientIp(req: Request): string | null;
  waitUntil(p: Promise<unknown>): void;
}
