import { Hono } from "hono";
import { z } from "zod";
import { requireRole, requireUser } from "../auth/permissions";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { setSetting } from "../lib/settings";
import { fail, parseJson } from "../lib/validate";
import { toCsv, type CsvCell } from "../stats/csv";
import {
  type Filter,
  linkCount,
  linksByOwner,
  rawClicks,
  recentLinks,
  summarize,
  targetCounts,
  topLinks,
  type Summary,
} from "../stats/queries";
import { getStatsSettings } from "../stats/retention";
import { findLink, parseFilter, type LinkInfo } from "../stats/service";
import type { DB } from "../platform/types";

/**
 * Statistics API.
 *
 *   GET /api/stats/summary?linkId=&from=&to=&tz=&bots=      one link (linkId) or everything
 *   GET /api/stats/dashboard?from=&to=&tz=&bots=            installation-wide, plus top links etc.
 *   GET /api/stats/export.csv?kind=clicks|summary&...       same filters as above
 *   GET|PUT /api/stats/settings                             admin: retention window
 *   GET /api/public/stats/:id?from=&to=&tz=                 no sign-in; 404 unless the link's stats are public
 *
 * `from` / `to` are milliseconds since the epoch (`from` empty = since the first click), `tz` is an IANA
 * name. Bots are excluded unless `bots=1`.
 */
export const statsRoutes = new Hono<AppEnv>();

async function targetsFor(db: DB, link: LinkInfo, f: Filter) {
  const declared = [
    { target: "main", url: link.url },
    ...link.rules.map((r, i) => ({ target: `rule:${i}`, url: r.url })),
    ...link.variants.map((v, i) => ({ target: `variant:${i}`, url: v.url })),
  ];
  const counts = new Map((await targetCounts(db, f)).map((t) => [t.target, t]));
  const rows = declared.map((d) => ({
    target: d.target,
    url: d.url as string | null,
    clicks: counts.get(d.target)?.clicks ?? 0,
    visitors: counts.get(d.target)?.visitors ?? 0,
  }));
  // Clicks served by a rule or variant that has been removed since.
  for (const [target, t] of counts) {
    if (!declared.some((d) => d.target === target)) rows.push({ target, url: null, clicks: t.clicks, visitors: t.visitors });
  }
  return rows.sort((a, b) => b.clicks - a.clicks); // stable: declared order breaks ties
}

const linkSummary = (l: LinkInfo) => ({ id: l.id, slug: l.slug, host: l.host, title: l.title });

statsRoutes.use("/stats/*", requireUser);

statsRoutes.get("/stats/summary", async (c) => {
  const { db } = c.var.platform;
  const linkId = c.req.query("linkId") || null;
  const link = linkId ? await findLink(db, linkId) : null;
  if (linkId && !link) return fail(c, 404, "not_found");
  const f = await parseFilter(c, linkId);
  if (f instanceof Response) return f;
  const [summary, targets] = await Promise.all([summarize(db, f), link ? targetsFor(db, link, f) : Promise.resolve([])]);
  return c.json({ ...summary, link: link ? linkSummary(link) : null, targets });
});

statsRoutes.get("/stats/dashboard", async (c) => {
  const { db } = c.var.platform;
  const f = await parseFilter(c, null);
  if (f instanceof Response) return f;
  const [summary, top, recent, owners, count] = await Promise.all([
    summarize(db, f),
    topLinks(db, f),
    recentLinks(db),
    linksByOwner(db),
    linkCount(db),
  ]);
  return c.json({ ...summary, topLinks: top, recentLinks: recent, linksByOwner: owners, linkCount: count });
});

const section = (name: string, rows: { key: string | null; clicks: number }[], empty: string): CsvCell[][] =>
  rows.map((r) => [name, r.key ?? empty, r.clicks]);

function summaryRows(s: Summary, extra: CsvCell[][]): CsvCell[][] {
  return [
    ["section", "label", "clicks"],
    ["total", "clicks", s.totals.clicks],
    ["total", "unique_visitors", s.totals.visitors],
    ["total", "bot_clicks", s.totals.bots],
    ...s.series.map((p): CsvCell[] => ["series", p.key, p.clicks]),
    ...section("referrers", s.referrers, "direct"),
    ...section("countries", s.countries, "unknown"),
    ...s.cities.map((r): CsvCell[] => ["cities", r.country ? `${r.key} (${r.country})` : r.key, r.clicks]),
    ...section("devices", s.devices, "unknown"),
    ...section("os", s.os, "unknown"),
    ...section("browsers", s.browsers, "unknown"),
    ...section("languages", s.languages, "unknown"),
    ...extra,
  ];
}

statsRoutes.get("/stats/export.csv", async (c) => {
  const { db } = c.var.platform;
  const linkId = c.req.query("linkId") || null;
  const link = linkId ? await findLink(db, linkId) : null;
  if (linkId && !link) return fail(c, 404, "not_found");
  const f = await parseFilter(c, linkId);
  if (f instanceof Response) return f;

  const day = new Date(f.to).toISOString().slice(0, 10);
  const name = `hop-${link ? `${link.slug}-` : ""}${c.req.query("kind") === "clicks" ? "clicks" : "stats"}-${day}.csv`
    .replace(/[^\w.+-]/g, "_");
  const headers = {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="${name}"`,
    "cache-control": "no-store",
  };

  if (c.req.query("kind") === "clicks") {
    // Raw clicks. Never the visitor hash, never an address.
    const rows = await rawClicks(db, f);
    return new Response(
      toCsv([
        ["time", "link", "referrer_host", "country", "region", "city", "device", "os", "browser", "language", "bot", "target"],
        ...rows.map((r): CsvCell[] => [
          new Date(r.ts).toISOString(),
          `${r.host}/${r.slug}`,
          r.referrerHost,
          r.country,
          r.region,
          r.city,
          r.device,
          r.os,
          r.browser,
          r.language,
          !!r.bot,
          r.target ?? "main",
        ]),
      ]),
      { headers },
    );
  }

  const [summary, targets, top] = await Promise.all([
    summarize(db, f),
    link ? targetsFor(db, link, f) : Promise.resolve([]),
    link ? Promise.resolve([]) : topLinks(db, f),
  ]);
  const extra: CsvCell[][] = [
    ...targets.map((t): CsvCell[] => ["targets", t.target, t.clicks]),
    ...top.map((t): CsvCell[] => ["top_links", `${t.host}/${t.slug}`, t.clicks]),
  ];
  return new Response(toCsv(summaryRows(summary, extra)), { headers });
});

/* ------------------------------ retention setting ------------------------------ */

statsRoutes.get("/stats/settings", requireRole("admin"), async (c) => {
  return c.json(await getStatsSettings(c.var.platform.db));
});

const settingsBody = z.object({ retentionDays: z.number().int().min(1).max(3650).nullable() });

statsRoutes.put("/stats/settings", requireRole("admin"), async (c) => {
  const body = await parseJson(c, settingsBody);
  await setSetting(c.var.platform.db, "stats", body);
  await audit(c, { action: "settings.update", entityType: "settings", entityId: "stats", data: body });
  return c.json({ ok: true });
});

/* ------------------------------ public statistics (E9) ------------------------------ */

statsRoutes.get("/public/stats/:id", async (c) => {
  const { db } = c.var.platform;
  const link = await findLink(db, c.req.param("id"));
  if (!link || !link.publicStats) return fail(c, 404, "not_found");
  const f = await parseFilter(c, link.id, true);
  if (f instanceof Response) return f;
  const s = await summarize(db, f, { cities: false });
  // Only what a stranger may see: no destination, owner, notes, targets or cities.
  return c.json({
    range: s.range,
    totals: { clicks: s.totals.clicks, visitors: s.totals.visitors },
    series: s.series,
    referrers: s.referrers,
    countries: s.countries,
    devices: s.devices,
    os: s.os,
    browsers: s.browsers,
    languages: s.languages,
    link: linkSummary(link),
  });
});
