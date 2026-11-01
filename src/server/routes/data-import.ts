import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireRole, sessionOnly } from "../auth/permissions";
import { clicks, domains, links, user } from "../db/schema";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { runBatch } from "../lib/batch";
import { fail, parseJson } from "../lib/validate";
import {
  checkImportLink,
  clicksBody,
  deriveClick,
  importKeyFor,
  linksBody,
  MAX_IMPORT_ROWS,
  type DeriveCaches,
} from "../data/yourls-import";

/**
 * YOURLS import (admin). The browser reads the dump and sends it in small chunks:
 *   POST /data/yourls/conflicts  { domainId, slugs }                       -> { existing }
 *   POST /data/yourls/links      { domainId, ownerId, redirectType, onConflict, links }
 *   POST /data/yourls/clicks     { domainId, rows }
 *   POST /data/yourls/finish     { domainId, summary }                     -> totals for checking
 */
export const dataImportRoutes = new Hono<AppEnv>();

dataImportRoutes.use("/data/yourls/*", requireRole("admin"), sessionOnly);

async function slugIndex(c: { var: { platform: { db: import("../platform/types").DB } } }, domainId: string) {
  const rows = await c.var.platform.db.select({ id: links.id, slug: links.slug }).from(links).where(eq(links.domainId, domainId));
  return new Map(rows.map((r) => [r.slug, r.id]));
}

dataImportRoutes.post("/data/yourls/conflicts", async (c) => {
  const body = await parseJson(c, z.object({ domainId: z.string().min(1), slugs: z.array(z.string()).max(5000) }));
  const index = await slugIndex(c, body.domainId);
  return c.json({ existing: body.slugs.filter((s) => index.has(s)) });
});

dataImportRoutes.post("/data/yourls/links", async (c) => {
  const body = await parseJson(c, linksBody);
  const { db } = c.var.platform;
  if (!(await db.select({ id: domains.id }).from(domains).where(eq(domains.id, body.domainId)).get())) return fail(c, 400, "unknown_domain");
  if (!(await db.select({ id: user.id }).from(user).where(eq(user.id, body.ownerId)).get())) return fail(c, 400, "unknown_owner");

  const index = await slugIndex(c, body.domainId);
  const now = new Date();
  const statements = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const skippedKeywords: string[] = [];
  const failed: { keyword: string; error: string }[] = [];
  const seen = new Set<string>();

  for (const l of body.links) {
    const problem = checkImportLink(l);
    if (problem) {
      failed.push({ keyword: l.keyword, error: problem });
      continue;
    }
    if (seen.has(l.keyword)) continue;
    seen.add(l.keyword);
    const createdAt = new Date(l.createdAt ?? now.getTime());
    const existing = index.get(l.keyword);
    if (existing) {
      if (body.onConflict === "skip") {
        skipped++;
        skippedKeywords.push(l.keyword);
        continue;
      }
      statements.push(
        db
          .update(links)
          .set({
            url: l.url,
            title: l.title || null,
            ownerId: body.ownerId,
            redirectType: body.redirectType,
            clickCount: l.clicks,
            createdAt,
            updatedAt: now,
          })
          .where(eq(links.id, existing)),
      );
      updated++;
    } else {
      statements.push(
        db.insert(links).values({
          id: crypto.randomUUID(),
          domainId: body.domainId,
          slug: l.keyword,
          url: l.url,
          title: l.title || null,
          ownerId: body.ownerId,
          redirectType: body.redirectType,
          clickCount: l.clicks,
          createdAt,
          updatedAt: now,
        }),
      );
      created++;
    }
  }
  await runBatch(db, statements);
  return c.json({ created, updated, skipped, skippedKeywords, failed });
});

dataImportRoutes.post("/data/yourls/clicks", async (c) => {
  const body = await parseJson(c, clicksBody);
  const { db, config } = c.var.platform;
  const index = await slugIndex(c, body.domainId);
  const caches: DeriveCaches = { ua: new Map(), hash: new Map() };

  const values: (typeof clicks.$inferInsert)[] = [];
  const lastByLink = new Map<string, number>();
  let orphans = 0;
  let invalid = 0;
  for (const row of body.rows) {
    const linkId = index.get(row.shortUrl);
    if (!linkId) {
      orphans++;
      continue;
    }
    if (row.ts === null) {
      invalid++;
      continue;
    }
    const derived = await deriveClick(config.authSecret, row, row.ts, caches);
    values.push({
      linkId,
      ts: new Date(row.ts),
      referrer: derived.referrer,
      referrerHost: derived.referrerHost,
      country: derived.country,
      device: derived.device,
      os: derived.os,
      browser: derived.browser,
      bot: derived.bot,
      visitorHash: derived.visitorHash,
      source: "import",
      importKey: importKeyFor(body.domainId, row.id),
    });
    if (row.ts > (lastByLink.get(linkId) ?? 0)) lastByLink.set(linkId, row.ts);
  }

  // D1 allows 100 bound parameters per statement: 8 rows of 12 values each.
  const statements = [];
  for (let i = 0; i < values.length; i += 8) {
    statements.push(db.insert(clicks).values(values.slice(i, i + 8)).onConflictDoNothing().returning({ id: clicks.id }));
  }
  for (const [linkId, ts] of lastByLink) {
    statements.push(
      db
        .update(links)
        .set({ lastClickedAt: sql`max(coalesce(${links.lastClickedAt}, 0), ${ts})` })
        .where(eq(links.id, linkId)),
    );
  }
  const results = await runBatch(db, statements);
  const insertCount = Math.ceil(values.length / 8);
  let inserted = 0;
  for (let i = 0; i < insertCount; i++) inserted += (results[i] as unknown[]).length;
  return c.json({ inserted, duplicates: values.length - inserted, orphans, invalid });
});

const finishBody = z.object({
  domainId: z.string().min(1),
  summary: z.record(z.string(), z.unknown()).optional(),
});

dataImportRoutes.post("/data/yourls/finish", async (c) => {
  const body = await parseJson(c, finishBody);
  const { db } = c.var.platform;
  const totals = await db
    .select({ links: sql<number>`count(*)`, lifetimeClicks: sql<number>`coalesce(sum(${links.clickCount}), 0)` })
    .from(links)
    .where(eq(links.domainId, body.domainId))
    .get();
  const imported = await db
    .select({ n: sql<number>`count(*)` })
    .from(clicks)
    .innerJoin(links, eq(links.id, clicks.linkId))
    .where(and(eq(links.domainId, body.domainId), eq(clicks.source, "import")))
    .get();
  const result = { links: totals?.links ?? 0, lifetimeClicks: totals?.lifetimeClicks ?? 0, importedClicks: imported?.n ?? 0 };
  await audit(c, { action: "data.import", entityType: "data", entityId: body.domainId, data: { source: "yourls", ...body.summary, totals: result } });
  return c.json(result);
});


