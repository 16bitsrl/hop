import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { clicks, links } from "../db/schema";
import type { AppEnv } from "../env";
import { runScheduledJobs } from "../jobs";

/**
 * Test-only helpers for statistics, mounted at /api/_test. 404 unless TEST_MODE is on.
 *
 * POST /clicks   { linkId, clicks: [{ ts, count?, linkId?, ...any clicks column }] } -> { inserted }
 *                `ts` is milliseconds; `count` repeats the row (default 1). Does not touch links.clickCount.
 * GET  /link/:id -> the links row.
 * POST /run-jobs -> runs the scheduled jobs now.
 */
export const testStatsRoutes = new Hono<AppEnv>();

testStatsRoutes.use("*", async (c, next) => {
  if (!c.var.platform.config.testMode) return c.notFound();
  await next();
});

type SeedClick = Partial<typeof clicks.$inferInsert> & { ts: number; count?: number };

testStatsRoutes.post("/clicks", async (c) => {
  const { db } = c.var.platform;
  const body = (await c.req.json()) as { linkId?: string; clicks?: SeedClick[] };
  if (!Array.isArray(body.clicks)) return c.json({ error: "clicks required" }, 400);

  const rows: (typeof clicks.$inferInsert)[] = [];
  for (const { count = 1, ts, linkId, ...rest } of body.clicks) {
    const id = linkId ?? body.linkId;
    if (!id || typeof ts !== "number") return c.json({ error: "linkId and ts required" }, 400);
    for (let i = 0; i < count; i++) rows.push({ ...rest, linkId: id, ts: new Date(ts) });
  }
  for (let i = 0; i < rows.length; i += 5) await db.insert(clicks).values(rows.slice(i, i + 5));
  return c.json({ inserted: rows.length });
});

testStatsRoutes.get("/link/:id", async (c) => {
  const [row] = await c.var.platform.db.select().from(links).where(eq(links.id, c.req.param("id"))).limit(1);
  return row ? c.json(row) : c.notFound();
});

testStatsRoutes.post("/run-jobs", async (c) => {
  await runScheduledJobs(c.var.platform);
  return c.json({ ok: true });
});
