import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { BACKUP_TABLES } from "../data/backup";
import type { AppEnv } from "../env";

/**
 * Test-only helper for the backup round trip, mounted at /api/_test. 404 unless TEST_MODE is on.
 *   POST /wipe   empties every table (sessions included): the installation goes back to first-run.
 */
export const testDataRoutes = new Hono<AppEnv>();

testDataRoutes.use("*", async (c, next) => {
  if (!c.var.platform.config.testMode) return c.notFound();
  await next();
});

testDataRoutes.post("/wipe", async (c) => {
  const { db } = c.var.platform;
  await db.run(sql`delete from session`);
  await db.run(sql`delete from verification`);
  // Children first.
  for (const { name } of [...BACKUP_TABLES].reverse()) await db.run(sql`delete from ${sql.identifier(name)}`);
  return c.json({ ok: true });
});
