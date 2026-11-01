import { and, desc, eq, isNull } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { Hono } from "hono";
import { z } from "zod";
import { displayPrefix, newKeySecret } from "../auth/api-keys";
import { requireRole, requireUser } from "../auth/permissions";
import { sha256Hex } from "../auth/users";
import { apiKeys, user } from "../db/schema";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { fail, parseJson } from "../lib/validate";

/**
 * Personal API keys (H1).
 *   GET    /api-keys            my keys
 *   POST   /api-keys  { name }  -> { key, secret }   (the secret is shown once)
 *   DELETE /api-keys/:id        revoke (mine, or any as admin)
 *   GET    /admin/api-keys      every key with its user (admin)
 * A key cannot manage keys: these routes need a signed-in session.
 */
export const apiKeyRoutes = new Hono<AppEnv>();

const MAX_ACTIVE_KEYS = 20;

const sessionOnly = createMiddleware<AppEnv>(async (c, next) => {
  if (c.var.authVia === "key") return c.json({ error: "forbidden" }, 403);
  await next();
});

apiKeyRoutes.use("/api-keys", requireUser, sessionOnly);
apiKeyRoutes.use("/api-keys/*", requireUser, sessionOnly);
apiKeyRoutes.use("/admin/api-keys", requireRole("admin"), sessionOnly);

const publicKey = (k: typeof apiKeys.$inferSelect) => ({
  id: k.id,
  name: k.name,
  prefix: k.prefix,
  lastUsedAt: k.lastUsedAt,
  revokedAt: k.revokedAt,
  createdAt: k.createdAt,
});

apiKeyRoutes.get("/api-keys", async (c) => {
  const rows = await c.var.platform.db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.userId, c.var.user!.id))
    .orderBy(desc(apiKeys.createdAt));
  return c.json({ keys: rows.map(publicKey) });
});

apiKeyRoutes.post("/api-keys", async (c) => {
  const { name } = await parseJson(c, z.object({ name: z.string().trim().min(1).max(60) }));
  const { db } = c.var.platform;
  const me = c.var.user!;
  const active = await db.select({ id: apiKeys.id }).from(apiKeys).where(and(eq(apiKeys.userId, me.id), isNull(apiKeys.revokedAt)));
  if (active.length >= MAX_ACTIVE_KEYS) return fail(c, 409, "too_many_keys");
  const secret = newKeySecret();
  const [row] = await db
    .insert(apiKeys)
    .values({ id: crypto.randomUUID(), userId: me.id, name, prefix: displayPrefix(secret), hash: await sha256Hex(secret) })
    .returning();
  await audit(c, { action: "key.create", entityType: "api_key", entityId: row!.id, data: { name, prefix: row!.prefix } });
  return c.json({ key: publicKey(row!), secret }, 201);
});

apiKeyRoutes.delete("/api-keys/:id", async (c) => {
  const { db } = c.var.platform;
  const me = c.var.user!;
  const row = await db.select().from(apiKeys).where(eq(apiKeys.id, c.req.param("id"))).get();
  if (!row) return fail(c, 404, "not_found");
  if (row.userId !== me.id && me.role !== "admin") return fail(c, 403, "forbidden");
  if (!row.revokedAt) {
    await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, row.id));
    await audit(c, {
      action: "key.revoke",
      entityType: "api_key",
      entityId: row.id,
      data: { name: row.name, prefix: row.prefix, ownerId: row.userId },
    });
  }
  return c.json({ ok: true });
});

apiKeyRoutes.get("/admin/api-keys", async (c) => {
  const rows = await c.var.platform.db
    .select({ key: apiKeys, userName: user.name, userEmail: user.email })
    .from(apiKeys)
    .innerJoin(user, eq(user.id, apiKeys.userId))
    .orderBy(desc(apiKeys.createdAt));
  return c.json({ keys: rows.map((r) => ({ ...publicKey(r.key), userId: r.key.userId, userName: r.userName, userEmail: r.userEmail })) });
});
