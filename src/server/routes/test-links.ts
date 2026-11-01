import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { clicks, domains, links } from "../db/schema";
import type { AppEnv } from "../env";
import { hashLinkPassword } from "../lib/password";

/**
 * Test-only seeding helpers, mounted at /api/_test. 404 unless TEST_MODE is on.
 *
 * POST /links  { host, rootUrl?, notFoundUrl?, slug, url, password?, ...any links column }
 *   -> { id, slug, domainId }. Creates the domain when missing.
 * GET /clicks?linkId=  -> clicks rows for the link, oldest first.
 */
export const testLinksRoutes = new Hono<AppEnv>();

testLinksRoutes.use("*", async (c, next) => {
  if (!c.var.platform.config.testMode) return c.notFound();
  await next();
});

testLinksRoutes.post("/links", async (c) => {
  const { db } = c.var.platform;
  const body = (await c.req.json()) as Record<string, unknown>;
  const { host, rootUrl, notFoundUrl, password, ...rest } = body;
  if (typeof host !== "string" || typeof body.slug !== "string" || typeof body.url !== "string") {
    return c.json({ error: "host, slug and url are required" }, 400);
  }

  let [domain] = await db.select().from(domains).where(eq(domains.host, host)).limit(1);
  if (!domain) {
    [domain] = await db
      .insert(domains)
      .values({
        id: crypto.randomUUID(),
        host,
        rootUrl: (rootUrl as string | undefined) ?? null,
        notFoundUrl: (notFoundUrl as string | undefined) ?? null,
      })
      .returning();
  }

  const values: Record<string, unknown> = { ...rest, id: crypto.randomUUID(), domainId: domain!.id };
  for (const key of ["expiresAt", "lastClickedAt", "healthCheckedAt"]) {
    if (typeof values[key] === "number") values[key] = new Date(values[key] as number);
  }
  if (typeof password === "string") values.passwordHash = await hashLinkPassword(password);

  const [link] = await db
    .insert(links)
    .values(values as typeof links.$inferInsert)
    .returning();
  return c.json({ id: link!.id, slug: link!.slug, domainId: domain!.id });
});

testLinksRoutes.get("/clicks", async (c) => {
  const linkId = c.req.query("linkId");
  if (!linkId) return c.json({ error: "linkId required" }, 400);
  const rows = await c.var.platform.db.select().from(clicks).where(eq(clicks.linkId, linkId)).orderBy(clicks.id);
  return c.json(rows);
});

/** GET /link-counters?linkId= -> { clickCount, lastClickedAt } straight from the links row. */
testLinksRoutes.get("/link-counters", async (c) => {
  const linkId = c.req.query("linkId");
  if (!linkId) return c.json({ error: "linkId required" }, 400);
  const row = await c.var.platform.db
    .select({ clickCount: links.clickCount, lastClickedAt: links.lastClickedAt })
    .from(links)
    .where(eq(links.id, linkId))
    .get();
  return c.json(row ?? null);
});
