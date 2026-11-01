import { Hono } from "hono";
import { z } from "zod";
import { canModify, requireRole } from "../auth/permissions";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { setSetting } from "../lib/settings";
import { parseJson } from "../lib/validate";
import { checkLink, getHealthSettings } from "../links/health";
import { getLinkRow, linkErrorHandler, serializeLinks } from "../links/service";

/**
 * Broken link check (J5).
 *   GET  /links-health/settings   { enabled, recheckDays }   (admin)
 *   PUT  /links-health/settings                              (admin)
 *   POST /links/:id/check         checks the destination now -> { link }  (admin, or the member who owns it)
 */
export const linkHealthRoutes = new Hono<AppEnv>();

linkHealthRoutes.onError(linkErrorHandler);

linkHealthRoutes.get("/links-health/settings", requireRole("admin"), async (c) => c.json(await getHealthSettings(c.var.platform.db)));

const settingsBody = z.object({ enabled: z.boolean(), recheckDays: z.number().int().min(1).max(90) });

linkHealthRoutes.put("/links-health/settings", requireRole("admin"), async (c) => {
  const body = await parseJson(c, settingsBody);
  await setSetting(c.var.platform.db, "linkHealth", body);
  await audit(c, { action: "settings.update", entityType: "settings", entityId: "linkHealth", data: body });
  return c.json(body);
});

linkHealthRoutes.post("/links/:id/check", requireRole("admin", "member"), async (c) => {
  const platform = c.var.platform;
  const row = await getLinkRow(platform.db, c.req.param("id"));
  // Checking makes the server request the destination: only for links the person may change.
  if (!canModify(c.var.user!, row.ownerId)) return c.json({ error: "forbidden" }, 403);
  const checked = await checkLink(platform, row, { confirm: true });
  const [link] = await serializeLinks(platform, c.var.user!, [checked]);
  return c.json({ link });
});


