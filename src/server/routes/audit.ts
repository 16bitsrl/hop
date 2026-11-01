import { and, desc, eq, like, sql } from "drizzle-orm";
import { Hono } from "hono";
import { requireRole } from "../auth/permissions";
import { auditLog, user } from "../db/schema";
import type { AppEnv } from "../env";

export const auditRoutes = new Hono<AppEnv>();

const PAGE_SIZE = 50;

/** Admin audit log. Filters: userId, entityType, action (prefix match), entityId. Paginated. */
auditRoutes.get("/audit", requireRole("admin"), async (c) => {
  const { db } = c.var.platform;
  const q = c.req.query();
  const page = Math.max(1, Number(q.page) || 1);
  const filters = [
    q.userId ? eq(auditLog.userId, q.userId) : undefined,
    q.entityType ? eq(auditLog.entityType, q.entityType) : undefined,
    q.entityId ? eq(auditLog.entityId, q.entityId) : undefined,
    q.action ? like(auditLog.action, `${q.action.replace(/[%_]/g, "")}%`) : undefined,
  ].filter((f) => f !== undefined);
  const where = filters.length ? and(...filters) : undefined;

  const [items, total, entityTypes, actions] = await Promise.all([
    db
      .select({
        id: auditLog.id,
        ts: auditLog.ts,
        userId: auditLog.userId,
        userName: user.name,
        action: auditLog.action,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        data: auditLog.data,
      })
      .from(auditLog)
      .leftJoin(user, eq(user.id, auditLog.userId))
      .where(where)
      .orderBy(desc(auditLog.ts), desc(auditLog.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: sql<number>`count(*)` }).from(auditLog).where(where).get(),
    db.selectDistinct({ v: auditLog.entityType }).from(auditLog).orderBy(auditLog.entityType),
    db.selectDistinct({ v: auditLog.action }).from(auditLog).orderBy(auditLog.action),
  ]);
  return c.json({
    items,
    total: total?.n ?? 0,
    page,
    pageSize: PAGE_SIZE,
    entityTypes: entityTypes.map((r) => r.v),
    actions: actions.map((r) => r.v),
  });
});
