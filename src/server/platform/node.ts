import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { existsSync, mkdirSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import maxmind, { type CityResponse, type Reader } from "maxmind";
import * as schema from "../db/schema";
import type { NodeSettings } from "./node-config";
import type { BlobStore, DB, Geo, Mailer, Platform, SmtpConfig } from "./types";

/** Blobs as files under `<dataDir>/blobs`, with the content type in a `.type` sidecar. */
export function diskBlobStore(dir: string): BlobStore {
  const root = path.resolve(dir);
  const fileFor = (key: string) => {
    const file = path.resolve(root, key);
    if (!file.startsWith(root + path.sep)) throw new Error(`invalid blob key: ${key}`);
    return file;
  };
  return {
    async put(key, body, contentType) {
      const file = fileFor(key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body instanceof Uint8Array ? body : new Uint8Array(body));
      await writeFile(`${file}.type`, contentType);
    },
    async get(key) {
      const file = fileFor(key);
      try {
        const buf = await readFile(file);
        const contentType = await readFile(`${file}.type`, "utf8").catch(() => "application/octet-stream");
        return { body: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, contentType };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      }
    },
    async delete(key) {
      const file = fileFor(key);
      await rm(file, { force: true });
      await rm(`${file}.type`, { force: true });
    },
  };
}

/** Opens (creating if needed) the SQLite file and applies the migrations. */
export function openDatabase(dataDir: string, migrationsDir: string) {
  mkdirSync(dataDir, { recursive: true });
  const sqlite = new Database(path.join(dataDir, "hop.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrationsDir });
  return { sqlite, db: db as unknown as DB };
}

function nodemailerMailer(smtp: SmtpConfig): Mailer {
  return {
    async send(mail) {
      const { createTransport } = await import("nodemailer");
      const transport = createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.tls === "ssl",
        requireTLS: smtp.tls === "starttls",
        ignoreTLS: smtp.tls === "none",
        auth: smtp.user ? { user: smtp.user, pass: smtp.pass ?? "" } : undefined,
      });
      try {
        await transport.sendMail({ from: smtp.from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
      } finally {
        transport.close();
      }
    },
  };
}

/** Cloudflare puts "XX" (unknown) and "T1" (Tor) in CF-IPCountry. */
const validCountry = (v: string | null) => (v && /^[A-Za-z]{2}$/.test(v) && !/^(xx|t1)$/i.test(v) ? v.toUpperCase() : undefined);

function readGeoHeaders(req: Request): Geo {
  const rawCity = req.headers.get("cf-ipcity");
  let city: string | undefined;
  try {
    city = rawCity ? decodeURIComponent(rawCity) : undefined;
  } catch {
    city = rawCity ?? undefined;
  }
  return {
    country: validCountry(req.headers.get("cf-ipcountry")),
    region: req.headers.get("cf-region-code") ?? undefined,
    city,
  };
}

export interface NodeRuntime {
  platform: Platform;
  /** Remote socket address of a request, filled by the HTTP server (used when proxy headers are not trusted). */
  remoteAddresses: WeakMap<Request, string>;
  /** Waits for pending background work (up to `timeoutMs`), then closes the database. */
  close(timeoutMs?: number): Promise<void>;
}

export async function createNodeRuntime(settings: NodeSettings): Promise<NodeRuntime> {
  const { config, dataDir, trustProxy } = settings;
  const { sqlite, db } = openDatabase(dataDir, settings.migrationsDir);

  const geoipPath = settings.geoipPath ?? path.join(dataDir, "geoip", "city.mmdb");
  let geoReader: Reader<CityResponse> | null = null;
  if (existsSync(geoipPath)) {
    geoReader = await maxmind.open<CityResponse>(geoipPath);
  } else if (settings.geoipPath) {
    throw new Error(`GEOIP_DB points to ${geoipPath}, which does not exist`);
  }

  const remoteAddresses = new WeakMap<Request, string>();
  const pending = new Set<Promise<unknown>>();

  const clientIp = (req: Request): string | null => {
    if (trustProxy) {
      const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      const ip = forwarded || req.headers.get("x-real-ip")?.trim();
      if (ip) return ip;
    }
    return remoteAddresses.get(req) ?? null;
  };

  const platform: Platform = {
    name: "node",
    db,
    blobs: diskBlobStore(path.join(dataDir, "blobs")),
    mailer: null,
    config,
    createSmtpMailer: nodemailerMailer,
    geo(req) {
      // Test mode never trusts real data: geo comes only from the test headers.
      if (config.testMode) {
        return {
          country: req.headers.get("x-test-country") ?? undefined,
          city: req.headers.get("x-test-city") ?? undefined,
        };
      }
      const fromHeaders = trustProxy ? readGeoHeaders(req) : {};
      if (fromHeaders.country && fromHeaders.city) return fromHeaders;
      const ip = clientIp(req);
      let found: Geo = {};
      if (geoReader && ip) {
        try {
          const r = geoReader.get(ip);
          found = { country: r?.country?.iso_code, region: r?.subdivisions?.[0]?.iso_code, city: r?.city?.names?.en };
        } catch {
          // not an IP the database can read
        }
      }
      return { country: fromHeaders.country ?? found.country, region: fromHeaders.region ?? found.region, city: fromHeaders.city ?? found.city };
    },
    clientIp,
    waitUntil(p) {
      const tracked = p.catch((e) => console.error("background task failed:", e)).finally(() => pending.delete(tracked));
      pending.add(tracked);
    },
  };

  return {
    platform,
    remoteAddresses,
    async close(timeoutMs = 10_000) {
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        Promise.allSettled([...pending]),
        new Promise((resolve) => (timer = setTimeout(resolve, timeoutMs))),
      ]);
      clearTimeout(timer);
      sqlite.close();
    },
  };
}
