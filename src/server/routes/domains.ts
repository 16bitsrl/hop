import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireRole, requireUser } from "../auth/permissions";
import { domains, links, user } from "../db/schema";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { parseJson } from "../lib/validate";
import { LinkError, linkErrorHandler } from "../links/service";
import { isHttpUrl } from "../redirect/destination";

export const domainRoutes = new Hono<AppEnv>();
domainRoutes.onError(linkErrorHandler);

const HOST = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

const host = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => HOST.test(v));
const optionalUrl = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z
    .string()
    .trim()
    .max(2048)
    .refine((v) => isHttpUrl(v))
    .nullable(),
);

const createBody = z.object({
  host,
  isDefault: z.boolean().optional(),
  rootUrl: optionalUrl.optional(),
  notFoundUrl: optionalUrl.optional(),
});
const updateBody = createBody.partial();

async function list(c: { var: AppEnv["Variables"] }) {
  const rows = await c.var.platform.db
    .select({
      id: domains.id,
      host: domains.host,
      isDefault: domains.isDefault,
      rootUrl: domains.rootUrl,
      notFoundUrl: domains.notFoundUrl,
      createdAt: domains.createdAt,
      linkCount: sql<number>`(select count(*) from ${links} where ${links.domainId} = ${domains.id})`,
    })
    .from(domains)
    .orderBy(domains.host);
  return rows;
}

/** Everyone signed in can see the domains (to pick one); only admins change them. */
domainRoutes.get("/domains", requireUser, async (c) => c.json({ domains: await list(c) }));

function assertNotAppHost(c: { var: AppEnv["Variables"] }, value: string) {
  if (value === c.var.platform.config.appHost.split(":")[0]!.toLowerCase()) throw new LinkError(400, "domain_is_app_host");
}

domainRoutes.post("/domains", requireRole("admin"), async (c) => {
  const { db } = c.var.platform;
  const body = await parseJson(c, createBody);
  assertNotAppHost(c, body.host);
  if (await db.select({ id: domains.id }).from(domains).where(eq(domains.host, body.host)).get()) throw new LinkError(409, "domain_exists");
  const first = !(await db.select({ id: domains.id }).from(domains).limit(1).get());
  const makeDefault = first || body.isDefault === true;
  if (makeDefault) await db.update(domains).set({ isDefault: false });
  const [created] = await db
    .insert(domains)
    .values({
      id: crypto.randomUUID(),
      host: body.host,
      isDefault: makeDefault,
      rootUrl: body.rootUrl ?? null,
      notFoundUrl: body.notFoundUrl ?? null,
    })
    .returning();
  await audit(c, { action: "domain.create", entityType: "domain", entityId: created!.id, data: { after: created } });
  return c.json({ domain: { ...created, linkCount: 0 } }, 201);
});

domainRoutes.patch("/domains/:id", requireRole("admin"), async (c) => {
  const { db } = c.var.platform;
  const id = c.req.param("id");
  const before = await db.select().from(domains).where(eq(domains.id, id)).get();
  if (!before) throw new LinkError(404, "not_found");
  const body = await parseJson(c, updateBody);
  if (body.host !== undefined && body.host !== before.host) {
    assertNotAppHost(c, body.host);
    if (await db.select({ id: domains.id }).from(domains).where(eq(domains.host, body.host)).get()) throw new LinkError(409, "domain_exists");
  }
  // There is always one default: it moves when another one is chosen, it cannot be switched off.
  if (body.isDefault === true && !before.isDefault) await db.update(domains).set({ isDefault: false });
  await db
    .update(domains)
    .set({
      ...(body.host !== undefined ? { host: body.host } : {}),
      ...(body.isDefault === true ? { isDefault: true } : {}),
      ...(body.rootUrl !== undefined ? { rootUrl: body.rootUrl } : {}),
      ...(body.notFoundUrl !== undefined ? { notFoundUrl: body.notFoundUrl } : {}),
    })
    .where(eq(domains.id, id));
  const after = await db.select().from(domains).where(eq(domains.id, id)).get();
  await audit(c, { action: "domain.update", entityType: "domain", entityId: id, data: { before, after } });
  return c.json({ domain: after });
});

domainRoutes.delete("/domains/:id", requireRole("admin"), async (c) => {
  const { db } = c.var.platform;
  const id = c.req.param("id");
  const before = await db.select().from(domains).where(eq(domains.id, id)).get();
  if (!before) throw new LinkError(404, "not_found");
  const used = await db.select({ n: sql<number>`count(*)` }).from(links).where(eq(links.domainId, id)).get();
  if ((used?.n ?? 0) > 0) throw new LinkError(409, "domain_has_links");
  if (before.isDefault && (await db.select({ id: domains.id }).from(domains).limit(2)).length > 1) {
    throw new LinkError(409, "domain_is_default");
  }
  await db.update(user).set({ defaultDomainId: null }).where(eq(user.defaultDomainId, id));
  await db.delete(domains).where(eq(domains.id, id));
  await audit(c, { action: "domain.delete", entityType: "domain", entityId: id, data: { before } });
  return c.json({ ok: true });
});
