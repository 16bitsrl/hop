import path from "node:path";
import { smtpFromEnv } from "./smtp-env";
import type { Config } from "./types";

export type Env = Record<string, string | undefined>;

export interface NodeSettings {
  config: Config;
  port: number;
  /** SQLite file, blobs and the GeoIP database live here. */
  dataDir: string;
  /** Explicit GEOIP_DB, if any (otherwise `<dataDir>/geoip/city.mmdb` is used when present). */
  geoipPath?: string;
  /** Trust X-Forwarded-For and the Cloudflare geo headers (only behind a reverse proxy). */
  trustProxy: boolean;
  /** Built SPA (the Vite client output). */
  staticDir: string;
  migrationsDir: string;
}

export class ConfigError extends Error {
  constructor(public problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

const flag = (v: string | undefined) => v === "1" || v?.toLowerCase() === "true";

/** Reads and validates the environment. Throws a `ConfigError` listing every problem at once. */
export function parseNodeEnv(env: Env): NodeSettings {
  const problems: string[] = [];
  const need = (name: string, hint: string) => {
    const v = env[name]?.trim();
    if (!v) problems.push(`${name} is required (${hint})`);
    return v ?? "";
  };

  const appHost = need("APP_HOST", "host serving the admin app, e.g. hop.example.com");
  if (appHost && /[/\s]|:\/\//.test(appHost)) problems.push("APP_HOST must be a bare host (optionally with :port), without scheme or path");

  const appUrl = (env.APP_URL?.trim() || (appHost ? `https://${appHost}` : "")).replace(/\/+$/, "");
  if (appUrl && !/^https?:\/\/[^/\s]+$/.test(appUrl)) problems.push("APP_URL must look like https://hop.example.com");

  const authSecret = need("AUTH_SECRET", "at least 32 random characters, e.g. `openssl rand -base64 32`");
  if (authSecret && authSecret.length < 32) problems.push("AUTH_SECRET is too short: use at least 32 characters");

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push(`PORT must be a number between 1 and 65535 (got "${env.PORT}")`);

  const smtpPort = env.SMTP_PORT;
  if (env.SMTP_HOST && smtpPort !== undefined && !Number.isInteger(Number(smtpPort))) problems.push(`SMTP_PORT must be a number (got "${smtpPort}")`);

  if (problems.length) throw new ConfigError(problems);

  const dataDir = path.resolve(env.DATA_DIR || "./data");
  return {
    config: {
      appHost,
      appUrl,
      authSecret,
      safeBrowsingKey: env.SAFE_BROWSING_KEY || undefined,
      metricsToken: env.METRICS_TOKEN || undefined,
      setupToken: env.SETUP_TOKEN || undefined,
      testMode: env.TEST_MODE === "1",
      smtp: smtpFromEnv({ ...env, APP_HOST: appHost }),
    },
    port,
    dataDir,
    geoipPath: env.GEOIP_DB || undefined,
    trustProxy: flag(env.TRUST_PROXY),
    staticDir: path.resolve(env.STATIC_DIR || "dist/client"),
    migrationsDir: path.resolve(env.MIGRATIONS_DIR || "migrations"),
  };
}
