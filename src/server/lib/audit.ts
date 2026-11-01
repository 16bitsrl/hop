import type { Context } from "hono";
import { auditLog } from "../db/schema";
import type { AppEnv } from "../env";

/**
 * Records who did what. Call it after every change a user makes.
 * `action` is "<entity>.<verb>" (link.create, user.role, settings.update...).
 */
export async function audit(
  c: Context<AppEnv>,
  entry: { action: string; entityType: string; entityId?: string | null; data?: unknown },
): Promise<void> {
  await c.var.platform.db.insert(auditLog).values({
    ts: new Date(),
    userId: c.var.user?.id ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    data: entry.data ?? null,
  });
}
