import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { canModify, requireRole, requireUser } from "../auth/permissions";
import { folders, linkTags, links, tags } from "../db/schema";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { parseJson } from "../lib/validate";
import { LinkError, defaultTagColor, linkErrorHandler } from "../links/service";

/** Tags and folders (A4, A5). Everyone signed in reads; admins and members create; admins manage tags. */
export const taxonomyRoutes = new Hono<AppEnv>();
taxonomyRoutes.onError(linkErrorHandler);

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const name = z.string().trim().min(1).max(50);

/* ---------------- tags ---------------- */

taxonomyRoutes.get("/tags", requireUser, async (c) => {
  const rows = await c.var.platform.db
    .select({
      id: tags.id,
      name: tags.name,
      color: tags.color,
      linkCount: sql<number>`(select count(*) from "link_tags" as "lt" where "lt"."tag_id" = "tags"."id")`,
    })
    .from(tags)
    .orderBy(tags.name);
  return c.json({ tags: rows });
});

async function tagNameTaken(c: { var: AppEnv["Variables"] }, value: string, exceptId?: string) {
  const all = await c.var.platform.db.select({ id: tags.id, name: tags.name }).from(tags);
  return all.some((t) => t.id !== exceptId && t.name.toLowerCase() === value.toLowerCase());
}

taxonomyRoutes.post("/tags", requireRole("admin", "member"), async (c) => {
  const body = await parseJson(c, z.object({ name, color: color.optional() }));
  if (await tagNameTaken(c, body.name)) throw new LinkError(409, "tag_exists");
  const [tag] = await c.var.platform.db
    .insert(tags)
    .values({ id: crypto.randomUUID(), name: body.name, color: body.color ?? defaultTagColor(body.name) })
    .returning();
  await audit(c, { action: "tag.create", entityType: "tag", entityId: tag!.id, data: { after: tag } });
  return c.json({ tag: { ...tag, linkCount: 0 } }, 201);
});

taxonomyRoutes.patch("/tags/:id", requireRole("admin"), async (c) => {
  const { db } = c.var.platform;
  const id = c.req.param("id");
  const before = await db.select().from(tags).where(eq(tags.id, id)).get();
  if (!before) throw new LinkError(404, "not_found");
  const body = await parseJson(c, z.object({ name, color }).partial());
  if (body.name && (await tagNameTaken(c, body.name, id))) throw new LinkError(409, "tag_exists");
  await db.update(tags).set(body).where(eq(tags.id, id));
  const after = await db.select().from(tags).where(eq(tags.id, id)).get();
  await audit(c, { action: "tag.update", entityType: "tag", entityId: id, data: { before, after } });
  return c.json({ tag: after });
});

taxonomyRoutes.delete("/tags/:id", requireRole("admin"), async (c) => {
  const { db } = c.var.platform;
  const id = c.req.param("id");
  const before = await db.select().from(tags).where(eq(tags.id, id)).get();
  if (!before) throw new LinkError(404, "not_found");
  await db.delete(linkTags).where(eq(linkTags.tagId, id));
  await db.delete(tags).where(eq(tags.id, id));
  await audit(c, { action: "tag.delete", entityType: "tag", entityId: id, data: { before } });
  return c.json({ ok: true });
});

/* ---------------- folders ---------------- */

const folderSelect = {
  id: folders.id,
  name: folders.name,
  parentId: folders.parentId,
  createdBy: folders.createdBy,
  linkCount: sql<number>`(select count(*) from "links" as "l" where "l"."folder_id" = "folders"."id")`,
};

taxonomyRoutes.get("/folders", requireUser, async (c) => {
  const me = c.var.user!;
  const rows = await c.var.platform.db.select(folderSelect).from(folders).orderBy(folders.name);
  return c.json({ folders: rows.map((f) => ({ ...f, canModify: canModify(me, f.createdBy) })) });
});

async function assertParent(c: { var: AppEnv["Variables"] }, parentId: string | null | undefined, selfId?: string) {
  if (!parentId) return;
  const all = await c.var.platform.db.select({ id: folders.id, parentId: folders.parentId }).from(folders);
  const byId = new Map(all.map((f) => [f.id, f]));
  if (!byId.has(parentId)) throw new LinkError(400, "unknown_folder");
  // A folder cannot move under itself or one of its own sub-folders.
  for (let cur: string | null | undefined = parentId; cur; cur = byId.get(cur)?.parentId) {
    if (cur === selfId) throw new LinkError(400, "folder_cycle");
  }
}

taxonomyRoutes.post("/folders", requireRole("admin", "member"), async (c) => {
  const body = await parseJson(c, z.object({ name, parentId: z.string().min(1).nullable().optional() }));
  await assertParent(c, body.parentId);
  const [created] = await c.var.platform.db
    .insert(folders)
    .values({ id: crypto.randomUUID(), name: body.name, parentId: body.parentId ?? null, createdBy: c.var.user!.id })
    .returning();
  await audit(c, { action: "folder.create", entityType: "folder", entityId: created!.id, data: { after: created } });
  return c.json({ folder: { ...created, linkCount: 0, canModify: true } }, 201);
});

taxonomyRoutes.patch("/folders/:id", requireUser, async (c) => {
  const { db } = c.var.platform;
  const id = c.req.param("id");
  const before = await db.select().from(folders).where(eq(folders.id, id)).get();
  if (!before) throw new LinkError(404, "not_found");
  if (!canModify(c.var.user!, before.createdBy)) throw new LinkError(403, "forbidden");
  const body = await parseJson(c, z.object({ name, parentId: z.string().min(1).nullable() }).partial());
  if (body.parentId !== undefined) await assertParent(c, body.parentId, id);
  await db.update(folders).set(body).where(eq(folders.id, id));
  const after = await db.select().from(folders).where(eq(folders.id, id)).get();
  await audit(c, { action: "folder.update", entityType: "folder", entityId: id, data: { before, after } });
  return c.json({ folder: after });
});

/** Deleting a folder moves its links to the root and its sub-folders one level up. */
taxonomyRoutes.delete("/folders/:id", requireUser, async (c) => {
  const { db } = c.var.platform;
  const id = c.req.param("id");
  const before = await db.select().from(folders).where(eq(folders.id, id)).get();
  if (!before) throw new LinkError(404, "not_found");
  const me = c.var.user!;
  if (!canModify(me, before.createdBy)) throw new LinkError(403, "forbidden");
  if (me.role !== "admin") {
    // Deleting moves what is inside: that must not touch other people's links or folders.
    const [foreignLinks, foreignFolders] = await Promise.all([
      db.select({ n: sql<number>`count(*)` }).from(links).where(and(eq(links.folderId, id), or(isNull(links.ownerId), ne(links.ownerId, me.id)))).get(),
      db.select({ n: sql<number>`count(*)` }).from(folders).where(and(eq(folders.parentId, id), or(isNull(folders.createdBy), ne(folders.createdBy, me.id)))).get(),
    ]);
    if ((foreignLinks?.n ?? 0) + (foreignFolders?.n ?? 0) > 0) throw new LinkError(409, "folder_not_yours_inside");
  }
  await db.update(links).set({ folderId: null }).where(eq(links.folderId, id));
  await db.update(folders).set({ parentId: before.parentId }).where(eq(folders.parentId, id));
  await db.delete(folders).where(eq(folders.id, id));
  await audit(c, { action: "folder.delete", entityType: "folder", entityId: id, data: { before } });
  return c.json({ ok: true });
});
