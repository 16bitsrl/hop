import { createMiddleware } from "hono/factory";
import type { Role, user } from "../db/schema";
import type { AppEnv } from "../env";

/**
 * Permission helpers for every area.
 *
 *   api.post("/links", requireUser, requireRole("admin", "member"), handler)
 *   if (!canModify(c.var.user!, link.ownerId)) return c.json({ error: "forbidden" }, 403);
 *
 * Everyone signed in can read everything.
 */

/** 401 when nobody is signed in. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.user) return c.json({ error: "unauthorized" }, 401);
  await next();
});

/** 401 when signed out, 403 when the role is not in the list. */
export const requireRole = (...roles: Role[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const u = c.var.user;
    if (!u) return c.json({ error: "unauthorized" }, 401);
    if (!roles.includes(u.role)) return c.json({ error: "forbidden" }, 403);
    await next();
  });

/** Admin: always. Member: only what they own. Viewer: never. */
export function canModify(u: Pick<typeof user.$inferSelect, "id" | "role">, ownerId: string | null | undefined): boolean {
  if (u.role === "admin") return true;
  if (u.role === "member") return !!ownerId && ownerId === u.id;
  return false;
}

/** Can create things at all (admin and member). */
export function canCreate(u: Pick<typeof user.$inferSelect, "role">): boolean {
  return u.role === "admin" || u.role === "member";
}
