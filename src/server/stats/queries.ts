import { sql, type SQL } from "drizzle-orm";
import type { DB } from "../platform/types";
import { bucketFormat, bucketKeys, chooseBucket, offsetSegments, type Bucket } from "./range";

/**
 * Statistics queries. Everything is aggregated in SQL and filters on `link_id` + `ts` (or `ts` alone)
 * so the `clicks_link_ts_idx` and `clicks_ts_idx` indexes are used.
 *
 * Unique visitors: the visitor hash rotates every UTC day, so a visitor is counted once per UTC day
 * (distinct day + hash pairs), summed over the range.
 */

const DAY_MS = 86_400_000;
const TOP = 10;

export type Filter = {
  /** Restrict to one link; null = the whole installation. */
  linkId: string | null;
  from: number;
  to: number;
  tz: string;
  /** Count clicks from bots too. */
  bots: boolean;
};

export type Row = { key: string | null; clicks: number };
export type CityRow = { key: string; country: string | null; clicks: number };
export type TargetRow = { target: string; url: string | null; clicks: number; visitors: number };

export type Summary = {
  range: { from: number; to: number; tz: string; bucket: Bucket };
  totals: { clicks: number; visitors: number; bots: number };
  series: { key: string; clicks: number }[];
  referrers: Row[];
  countries: Row[];
  cities: CityRow[];
  devices: Row[];
  os: Row[];
  browsers: Row[];
  languages: Row[];
};

function where(f: Filter, withBots = f.bots): SQL {
  const parts: SQL[] = [];
  if (f.linkId) parts.push(sql`link_id = ${f.linkId}`);
  parts.push(sql`ts >= ${f.from}`, sql`ts <= ${f.to}`);
  if (!withBots) parts.push(sql`bot = 0`);
  return sql.join(parts, sql` AND `);
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

export async function totals(db: DB, f: Filter) {
  const [row] = await db.all<{ humans: number | null; bots: number | null; total: number | null }>(sql`
    SELECT SUM(CASE WHEN bot = 0 THEN 1 ELSE 0 END) AS humans,
           SUM(CASE WHEN bot = 1 THEN 1 ELSE 0 END) AS bots,
           COUNT(*) AS total
    FROM clicks WHERE ${where(f, true)}`);
  const [visitors] = await db.all<{ n: number }>(sql`
    SELECT COUNT(*) AS n FROM (
      SELECT 1 FROM clicks
      WHERE ${where(f)} AND visitor_hash IS NOT NULL
      GROUP BY ts / ${DAY_MS}, visitor_hash
    )`);
  return {
    clicks: f.bots ? num(row?.total) : num(row?.humans),
    visitors: num(visitors?.n),
    bots: num(row?.bots),
  };
}

/** SQL expression: the UTC offset (ms) in force at `ts`, piecewise over daylight saving changes. */
function offsetExpr(f: Filter): SQL {
  const segs = offsetSegments(f.tz, f.from, f.to);
  if (segs.length === 1) return sql.raw(String(segs[0]!.offset));
  const whens = segs
    .slice(1)
    .map((s, i) => `WHEN ts < ${Math.trunc(s.start)} THEN ${Math.trunc(segs[i]!.offset)}`)
    .join(" ");
  return sql.raw(`CASE ${whens} ELSE ${Math.trunc(segs[segs.length - 1]!.offset)} END`);
}

export async function series(db: DB, f: Filter, bucket: Bucket) {
  const rows = await db.all<{ k: string; clicks: number }>(sql`
    SELECT strftime(${bucketFormat[bucket]}, (ts + ${offsetExpr(f)}) / 1000, 'unixepoch') AS k, COUNT(*) AS clicks
    FROM clicks WHERE ${where(f)} GROUP BY k`);
  const counts = new Map(rows.map((r) => [r.k, num(r.clicks)]));
  return bucketKeys(bucket, f.from, f.to, f.tz).map((key) => ({ key, clicks: counts.get(key) ?? 0 }));
}

const DIMENSIONS = { referrer_host: 1, country: 1, device: 1, os: 1, browser: 1, language: 1 } as const;

export async function dimension(db: DB, f: Filter, column: keyof typeof DIMENSIONS, limit = TOP): Promise<Row[]> {
  if (!(column in DIMENSIONS)) throw new Error("unknown column");
  const col = sql.raw(column);
  const rows = await db.all<{ k: string | null; clicks: number }>(sql`
    SELECT NULLIF(${col}, '') AS k, COUNT(*) AS clicks
    FROM clicks WHERE ${where(f)}
    GROUP BY k ORDER BY clicks DESC, k ASC LIMIT ${limit}`);
  return rows.map((r) => ({ key: r.k, clicks: num(r.clicks) }));
}

export async function cities(db: DB, f: Filter, limit = TOP): Promise<CityRow[]> {
  const rows = await db.all<{ k: string; country: string | null; clicks: number }>(sql`
    SELECT city AS k, NULLIF(country, '') AS country, COUNT(*) AS clicks
    FROM clicks WHERE ${where(f)} AND city IS NOT NULL AND city <> ''
    GROUP BY city, country ORDER BY clicks DESC, k ASC LIMIT ${limit}`);
  return rows.map((r) => ({ key: r.k, country: r.country, clicks: num(r.clicks) }));
}

export async function targetCounts(db: DB, f: Filter) {
  const rows = await db.all<{ t: string; clicks: number; visitors: number }>(sql`
    SELECT COALESCE(NULLIF(target, ''), 'main') AS t, COUNT(*) AS clicks,
           COUNT(DISTINCT CASE WHEN visitor_hash IS NULL THEN NULL ELSE (ts / ${DAY_MS}) || ':' || visitor_hash END) AS visitors
    FROM clicks WHERE ${where(f)} GROUP BY t`);
  return rows.map((r) => ({ target: r.t, clicks: num(r.clicks), visitors: num(r.visitors) }));
}

export async function firstClickAt(db: DB, linkId: string | null): Promise<number | null> {
  const [row] = linkId
    ? await db.all<{ m: number | null }>(sql`SELECT MIN(ts) AS m FROM clicks WHERE link_id = ${linkId}`)
    : await db.all<{ m: number | null }>(sql`SELECT MIN(ts) AS m FROM clicks`);
  return row?.m ?? null;
}

/** Everything shared by the link page, the dashboard and the public page. */
export async function summarize(db: DB, f: Filter, opts: { cities?: boolean } = {}): Promise<Summary> {
  const bucket = chooseBucket(f.from, f.to);
  const [t, s, referrers, countries, devices, os, browsers, languages, cityRows] = await Promise.all([
    totals(db, f),
    series(db, f, bucket),
    dimension(db, f, "referrer_host"),
    dimension(db, f, "country"),
    dimension(db, f, "device"),
    dimension(db, f, "os"),
    dimension(db, f, "browser"),
    dimension(db, f, "language"),
    opts.cities === false ? Promise.resolve([]) : cities(db, f),
  ]);
  return {
    range: { from: f.from, to: f.to, tz: f.tz, bucket },
    totals: t,
    series: s,
    referrers,
    countries,
    cities: cityRows,
    devices,
    os,
    browsers,
    languages,
  };
}

/* ------------------------------ dashboard ------------------------------ */

export async function topLinks(db: DB, f: Filter) {
  const rows = await db.all<{ id: string; slug: string; title: string | null; host: string; clicks: number }>(sql`
    SELECT l.id AS id, l.slug AS slug, l.title AS title, d.host AS host, COUNT(*) AS clicks
    FROM clicks c
    JOIN links l ON l.id = c.link_id
    JOIN domains d ON d.id = l.domain_id
    WHERE ${where(f)}
    GROUP BY c.link_id ORDER BY clicks DESC, l.slug ASC LIMIT ${TOP}`);
  return rows.map((r) => ({ ...r, clicks: num(r.clicks) }));
}

export async function recentLinks(db: DB) {
  const rows = await db.all<{
    id: string;
    slug: string;
    title: string | null;
    host: string;
    createdAt: number;
    ownerName: string | null;
  }>(sql`
    SELECT l.id AS id, l.slug AS slug, l.title AS title, d.host AS host, l.created_at AS createdAt, u.name AS ownerName
    FROM links l
    JOIN domains d ON d.id = l.domain_id
    LEFT JOIN user u ON u.id = l.owner_id
    ORDER BY l.created_at DESC, l.id DESC LIMIT 8`);
  return rows.map((r) => ({ ...r, createdAt: num(r.createdAt) }));
}

export async function linksByOwner(db: DB) {
  const rows = await db.all<{ ownerId: string | null; name: string | null; links: number }>(sql`
    SELECT l.owner_id AS ownerId, u.name AS name, COUNT(*) AS links
    FROM links l LEFT JOIN user u ON u.id = l.owner_id
    GROUP BY l.owner_id ORDER BY links DESC, name ASC LIMIT 20`);
  return rows.map((r) => ({ ...r, links: num(r.links) }));
}

export async function linkCount(db: DB): Promise<number> {
  const [row] = await db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM links`);
  return num(row?.n);
}

/* ------------------------------ raw export ------------------------------ */

export const EXPORT_LIMIT = 100_000;

export async function rawClicks(db: DB, f: Filter) {
  return db.all<{
    ts: number;
    host: string;
    slug: string;
    referrerHost: string | null;
    country: string | null;
    region: string | null;
    city: string | null;
    device: string | null;
    os: string | null;
    browser: string | null;
    language: string | null;
    bot: number;
    target: string | null;
  }>(sql`
    SELECT c.ts AS ts, d.host AS host, l.slug AS slug, c.referrer_host AS referrerHost, c.country AS country,
           c.region AS region, c.city AS city, c.device AS device, c.os AS os, c.browser AS browser,
           c.language AS language, c.bot AS bot, c.target AS target
    FROM clicks c
    JOIN links l ON l.id = c.link_id
    JOIN domains d ON d.id = l.domain_id
    WHERE ${where(f)}
    ORDER BY c.ts ASC, c.id ASC LIMIT ${EXPORT_LIMIT}`);
}
