import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireRole } from "../auth/permissions";
import { blockedDomains } from "../db/schema";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { setSetting } from "../lib/settings";
import { parseJson } from "../lib/validate";
import { isValidBlockedHost, normalizeHost } from "../links/safety";
import { LinkError, getSlugSettings, linkErrorHandler } from "../links/service";
import { normalizeAlphabet } from "../links/slug";

/** Admin settings of the links area: slug generator (A1) and blocked domains (J6). */
export const linkSettingsRoutes = new Hono<AppEnv>();
linkSettingsRoutes.onError(linkErrorHandler);

linkSettingsRoutes.use("/settings/slugs", requireRole("admin"));
linkSettingsRoutes.use("/blocked-domains", requireRole("admin"));
linkSettingsRoutes.use("/blocked-domains/*", requireRole("admin"));

linkSettingsRoutes.get("/settings/slugs", async (c) => c.json(await getSlugSettings(c.var.platform.db)));

linkSettingsRoutes.put("/settings/slugs", async (c) => {
  const body = await parseJson(c, z.object({ length: z.number().int().min(3).max(32), alphabet: z.string().max(100) }));
  const alphabet = normalizeAlphabet(body.alphabet);
  if (alphabet.length < 2) throw new LinkError(400, "alphabet_too_short");
  const next = { length: body.length, alphabet };
  const before = await getSlugSettings(c.var.platform.db);
  await setSetting(c.var.platform.db, "slugs", next);
  await audit(c, { action: "settings.update", entityType: "settings", entityId: "slugs", data: { before, after: next } });
  return c.json(next);
});

linkSettingsRoutes.get("/blocked-domains", async (c) => {
  const rows = await c.var.platform.db.select().from(blockedDomains).orderBy(blockedDomains.host);
  return c.json({ blocked: rows });
});

linkSettingsRoutes.post("/blocked-domains", async (c) => {
  const body = await parseJson(c, z.object({ host: z.string().trim().min(1).max(300), reason: z.string().trim().max(300).optional() }));
  const host = normalizeHost(body.host);
  if (!isValidBlockedHost(host)) throw new LinkError(400, "invalid_request");
  const { db } = c.var.platform;
  if (await db.select({ id: blockedDomains.id }).from(blockedDomains).where(eq(blockedDomains.host, host)).get()) {
    throw new LinkError(409, "blocked_exists");
  }
  const [blocked] = await db
    .insert(blockedDomains)
    .values({ id: crypto.randomUUID(), host, reason: body.reason || null })
    .returning();
  await audit(c, { action: "blocked_domain.create", entityType: "blocked_domain", entityId: blocked!.id, data: { after: blocked } });
  return c.json({ blocked }, 201);
});

linkSettingsRoutes.delete("/blocked-domains/:id", async (c) => {
  const { db } = c.var.platform;
  const id = c.req.param("id");
  const before = await db.select().from(blockedDomains).where(eq(blockedDomains.id, id)).get();
  if (!before) throw new LinkError(404, "not_found");
  await db.delete(blockedDomains).where(eq(blockedDomains.id, id));
  await audit(c, { action: "blocked_domain.delete", entityType: "blocked_domain", entityId: id, data: { before } });
  return c.json({ ok: true });
});
