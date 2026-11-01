import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { canModify, canCreate, requireRole, requireUser } from "../auth/permissions";
import { auditLog, blockedDomains, domains, folders, linkTags, links, user } from "../db/schema";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { parseJson } from "../lib/validate";
import { CSV_TEMPLATE, MAX_BATCH, readCsvRows, type CsvRow } from "../links/csv";
import { checkSafeBrowsing, isHostBlocked } from "../links/safety";
import { bulkBody, createLinkBody, updateLinkBody } from "../links/schemas";
import {
  LinkError,
  auditSnapshot,
  createLinkRecord,
  diffSnapshots,
  getLinkRow,
  linkErrorHandler,
  lookupPageMeta,
  resolveDomain,
  serializeLinks,
  setLinkTags,
  updateLinkRecord,
} from "../links/service";
import { isHttpUrl } from "../redirect/destination";
import { z } from "zod";

export const linksRoutes = new Hono<AppEnv>();

linksRoutes.onError(linkErrorHandler);

linksRoutes.use("/links", requireUser);
linksRoutes.use("/links/*", requireUser);

const PAGE_SIZE_MAX = 100;

/** Escapes LIKE wildcards; the pattern uses "!" as the escape character. */
const likePattern = (q: string) => `%${q.replace(/[!%_]/g, (m) => `!${m}`)}%`;

/* ---------------------------------------------------------------- */
/* List                                                              */
/* ---------------------------------------------------------------- */

linksRoutes.get("/links", async (c) => {
  const platform = c.var.platform;
  const { db } = platform;
  const q = c.req.query();
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(q.pageSize) || 25));
  const now = Date.now();

  const where: (SQL | undefined)[] = [];
  const term = q.q?.trim();
  if (term) {
    const pat = likePattern(term);
    where.push(
      or(
        sql`${links.slug} like ${pat} escape '!'`,
        sql`${links.url} like ${pat} escape '!'`,
        sql`${links.title} like ${pat} escape '!'`,
        sql`${links.notes} like ${pat} escape '!'`,
      ),
    );
  }
  if (q.owner) where.push(eq(links.ownerId, q.owner));
  if (q.domain) where.push(eq(links.domainId, q.domain));
  if (q.tag) where.push(sql`exists (select 1 from ${linkTags} where ${linkTags.linkId} = ${links.id} and ${linkTags.tagId} = ${q.tag})`);
  if (q.folder === "none") where.push(sql`${links.folderId} is null`);
  else if (q.folder) {
    const all = await db.select({ id: folders.id, parentId: folders.parentId }).from(folders);
    const ids = new Set([q.folder]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const f of all) if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) (ids.add(f.id), (grew = true));
    }
    where.push(inArray(links.folderId, [...ids]));
  }
  const expired = sql`((${links.expiresAt} is not null and ${links.expiresAt} <= ${now}) or (${links.maxClicks} is not null and ${links.clickCount} >= ${links.maxClicks}))`;
  if (q.state === "active") where.push(sql`${links.enabled} = 1 and not ${expired}`);
  else if (q.state === "disabled") where.push(sql`${links.enabled} = 0`);
  else if (q.state === "expired") where.push(expired);
  else if (q.state === "broken") where.push(eq(links.healthStatus, "broken"));
  else if (q.state === "protected") where.push(sql`${links.passwordHash} is not null`);

  const filter = and(...where);
  const dir = q.dir === "asc" ? asc : desc;
  const order =
    q.sort === "clicks"
      ? [dir(links.clickCount)]
      : q.sort === "lastClick"
        ? [sql`${links.lastClickedAt} is null`, dir(links.lastClickedAt)]
        : q.sort === "slug"
          ? [dir(links.slug)]
          : [dir(links.createdAt)];

  const [rows, total] = await Promise.all([
    db
      .select()
      .from(links)
      .where(filter)
      .orderBy(...order, desc(links.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ n: sql<number>`count(*)` }).from(links).where(filter).get(),
  ]);
  return c.json({ items: await serializeLinks(platform, c.var.user!, rows), total: total?.n ?? 0, page, pageSize });
});

/* ---------------------------------------------------------------- */
/* Page metadata                                                     */
/* ---------------------------------------------------------------- */

linksRoutes.get("/links/meta", async (c) => {
  const url = c.req.query("url") ?? "";
  if (!isHttpUrl(url)) return c.json({ error: "invalid_url" }, 400);
  const meta = await lookupPageMeta(c.var.platform.config, url);
  return c.json(meta ?? { title: null, description: null, image: null });
});

/* ---------------------------------------------------------------- */
/* Bulk                                                              */
/* ---------------------------------------------------------------- */

linksRoutes.post("/links/bulk", requireRole("admin", "member"), async (c) => {
  const platform = c.var.platform;
  const { db } = platform;
  const me = c.var.user!;
  const body = await parseJson(c, bulkBody);
  if (new Set(body.ids).size > MAX_BATCH) return c.json({ error: "batch_too_large", max: MAX_BATCH }, 400);
  if ((body.action === "addTag" || body.action === "removeTag") && !body.tag) return c.json({ error: "invalid_request", fields: ["tag"] }, 400);
  if (body.action === "move") {
    if (body.folderId === undefined) return c.json({ error: "invalid_request", fields: ["folderId"] }, 400);
    if (body.folderId && !(await db.select({ id: folders.id }).from(folders).where(eq(folders.id, body.folderId)).get())) {
      throw new LinkError(400, "unknown_folder");
    }
  }

  let done = 0;
  const skipped: { id: string; reason: "forbidden" | "not_found" }[] = [];
  for (const id of [...new Set(body.ids)]) {
    const row = await db.select().from(links).where(eq(links.id, id)).get();
    if (!row) {
      skipped.push({ id, reason: "not_found" });
      continue;
    }
    if (!canModify(me, row.ownerId)) {
      skipped.push({ id, reason: "forbidden" });
      continue;
    }
    const [beforeJson] = await serializeLinks(platform, me, [row]);
    const before = await auditSnapshot(db, beforeJson!);

    if (body.action === "delete") {
      await db.delete(linkTags).where(eq(linkTags.linkId, id));
      await db.delete(links).where(eq(links.id, id));
      await audit(c, { action: "link.delete", entityType: "link", entityId: id, data: { before, bulk: true } });
      done++;
      continue;
    }

    if (body.action === "addTag") {
      await setLinkTags(db, id, [...beforeJson!.tags.map((t) => t.name), body.tag!]);
    } else if (body.action === "removeTag") {
      const ids = beforeJson!.tags.filter((t) => t.name.toLowerCase() === body.tag!.toLowerCase()).map((t) => t.id);
      if (ids.length) await db.delete(linkTags).where(and(eq(linkTags.linkId, id), inArray(linkTags.tagId, ids)));
    } else {
      const set =
        body.action === "move"
          ? { folderId: body.folderId ?? null }
          : { enabled: body.action === "enable" };
      await db.update(links).set({ ...set, updatedAt: new Date() }).where(eq(links.id, id));
    }
    const fresh = await getLinkRow(db, id);
    const [afterJson] = await serializeLinks(platform, me, [fresh]);
    const diff = diffSnapshots(before, await auditSnapshot(db, afterJson!));
    if (Object.keys(diff.after).length) await audit(c, { action: "link.update", entityType: "link", entityId: id, data: { ...diff, bulk: true } });
    done++;
  }
  return c.json({ done, skipped });
});

/* ---------------------------------------------------------------- */
/* CSV import                                                        */
/* ---------------------------------------------------------------- */

const importBody = z.object({ csv: z.string().max(2_000_000), lineOffset: z.number().int().min(0).max(100_000).optional() });

type ImportRow = CsvRow & { domainId?: string };

/** Reads the file and adds the checks that need the database. */
async function evaluateImport(c: Context<AppEnv>, csv: string, opts: { maxRows?: number; lineOffset?: number } = {}) {
  const platform = c.var.platform;
  const { db } = platform;
  const parsed = readCsvRows(csv);
  if (parsed.error) throw new LinkError(400, parsed.error);
  const rows: ImportRow[] = parsed.rows;
  if (opts.maxRows !== undefined && rows.length > opts.maxRows) throw new LinkError(400, "batch_too_large");
  for (const row of rows) row.line += opts.lineOffset ?? 0;

  const domainRows = await db.select().from(domains);
  const byHost = new Map(domainRows.map((d) => [d.host, d]));
  const fallback = await resolveDomain(db, c.var.user!, null).catch(() => null);
  const blocked = (await db.select({ host: blockedDomains.host }).from(blockedDomains)).map((b) => b.host);

  const existing = new Set<string>();
  const slugsByDomain = new Map<string, string[]>();
  for (const row of rows) {
    const domain = row.domain ? byHost.get(row.domain) : fallback;
    if (!domain) {
      row.errors.push(row.domain ? "unknown_domain" : "no_domain");
      continue;
    }
    row.domainId = domain.id;
    if (row.slug) slugsByDomain.set(domain.id, [...(slugsByDomain.get(domain.id) ?? []), row.slug]);
    if (!row.errors.includes("invalid_url") && isHostBlocked(new URL(row.url).hostname, blocked)) row.errors.push("destination_blocked");
  }
  for (const [domainId, slugs] of slugsByDomain) {
    for (let i = 0; i < slugs.length; i += 50) {
      const found = await db
        .select({ slug: links.slug })
        .from(links)
        .where(and(eq(links.domainId, domainId), inArray(links.slug, slugs.slice(i, i + 50))));
      for (const f of found) existing.add(`${domainId}\u0000${f.slug}`);
    }
  }
  for (const row of rows) if (row.domainId && row.slug && existing.has(`${row.domainId}\u0000${row.slug}`)) row.errors.push("slug_taken");

  const key = platform.config.safeBrowsingKey;
  if (key) {
    const candidates = rows.filter((r) => r.errors.length === 0).map((r) => r.url);
    const { unsafe } = await checkSafeBrowsing(candidates, key);
    const bad = new Set(unsafe);
    for (const row of rows) if (bad.has(row.url)) row.errors.push("destination_unsafe");
  }
  return rows;
}

const publicRow = ({ domainId: _d, ...row }: ImportRow) => row;

linksRoutes.post("/links/import/preview", requireRole("admin", "member"), async (c) => {
  const { csv } = await parseJson(c, importBody);
  const rows = await evaluateImport(c, csv);
  return c.json({ rows: rows.map(publicRow), validCount: rows.filter((r) => r.errors.length === 0).length });
});

linksRoutes.get("/links/import/template", (c) => c.body(CSV_TEMPLATE, 200, { "content-type": "text/csv; charset=utf-8" }));

linksRoutes.post("/links/import", requireRole("admin", "member"), async (c) => {
  const platform = c.var.platform;
  const { db } = platform;
  const me = c.var.user!;
  const { csv, lineOffset } = await parseJson(c, importBody);
  const rows = await evaluateImport(c, csv, { maxRows: MAX_BATCH, lineOffset });

  const folderIds = new Map<string, string>();
  const allFolders = await db.select().from(folders);
  for (const f of allFolders) if (!folderIds.has(f.name.toLowerCase())) folderIds.set(f.name.toLowerCase(), f.id);

  const created: { line: number; id: string; slug: string; shortUrl: string }[] = [];
  const failed: { line: number; url: string; slug: string; errors: string[] }[] = [];
  for (const row of rows) {
    if (row.errors.length) {
      failed.push({ line: row.line, url: row.url, slug: row.slug, errors: row.errors });
      continue;
    }
    try {
      let folderId: string | null = null;
      if (row.folder) {
        folderId = folderIds.get(row.folder.toLowerCase()) ?? null;
        if (!folderId) {
          folderId = crypto.randomUUID();
          await db.insert(folders).values({ id: folderId, name: row.folder, createdBy: me.id });
          folderIds.set(row.folder.toLowerCase(), folderId);
        }
      }
      const rowLink = await createLinkRecord(
        platform,
        me,
        createLinkBody.parse({
          url: row.url,
          slug: row.slug || null,
          title: row.title || null,
          notes: row.notes || null,
          tags: row.tags,
          folderId,
          fetchMeta: false,
        }),
        { skipSafety: true, domainId: row.domainId },
      );
      const [json] = await serializeLinks(platform, me, [rowLink]);
      await audit(c, {
        action: "link.create",
        entityType: "link",
        entityId: rowLink.id,
        data: { after: await auditSnapshot(db, json!), source: "import" },
      });
      created.push({ line: row.line, id: rowLink.id, slug: rowLink.slug, shortUrl: json!.shortUrl });
    } catch (e) {
      if (!(e instanceof LinkError)) throw e;
      failed.push({ line: row.line, url: row.url, slug: row.slug, errors: [e.code] });
    }
  }
  return c.json({ created: created.length, links: created, failed });
});

/* ---------------------------------------------------------------- */
/* Single link                                                       */
/* ---------------------------------------------------------------- */

linksRoutes.get("/links/:id", async (c) => {
  const row = await getLinkRow(c.var.platform.db, c.req.param("id"));
  const [link] = await serializeLinks(c.var.platform, c.var.user!, [row]);
  return c.json({ link });
});

/** Change history of one link, newest first. Everyone signed in can read it. */
linksRoutes.get("/links/:id/history", async (c) => {
  const id = c.req.param("id");
  const items = await c.var.platform.db
    .select({
      id: auditLog.id,
      ts: auditLog.ts,
      userId: auditLog.userId,
      userName: user.name,
      action: auditLog.action,
      data: auditLog.data,
    })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.userId))
    .where(and(eq(auditLog.entityType, "link"), eq(auditLog.entityId, id)))
    .orderBy(desc(auditLog.ts), desc(auditLog.id))
    .limit(200);
  return c.json({ items });
});

linksRoutes.post("/links", requireRole("admin", "member"), async (c) => {
  const platform = c.var.platform;
  const me = c.var.user!;
  if (!canCreate(me)) return c.json({ error: "forbidden" }, 403);
  const body = await parseJson(c, createLinkBody);
  const row = await createLinkRecord(platform, me, body);
  const [link] = await serializeLinks(platform, me, [row]);
  await audit(c, { action: "link.create", entityType: "link", entityId: row.id, data: { after: await auditSnapshot(platform.db, link!) } });
  return c.json({ link }, 201);
});

linksRoutes.patch("/links/:id", async (c) => {
  const platform = c.var.platform;
  const me = c.var.user!;
  const current = await getLinkRow(platform.db, c.req.param("id"));
  if (!canModify(me, current.ownerId)) return c.json({ error: "forbidden" }, 403);
  const body = await parseJson(c, updateLinkBody);

  const [beforeJson] = await serializeLinks(platform, me, [current]);
  const before = await auditSnapshot(platform.db, beforeJson!);
  const row = await updateLinkRecord(platform, current, body);
  const [link] = await serializeLinks(platform, me, [row]);
  const diff = diffSnapshots(before, await auditSnapshot(platform.db, link!));
  if (Object.keys(diff.after).length) await audit(c, { action: "link.update", entityType: "link", entityId: row.id, data: diff });
  return c.json({ link });
});

linksRoutes.delete("/links/:id", async (c) => {
  const platform = c.var.platform;
  const me = c.var.user!;
  const current = await getLinkRow(platform.db, c.req.param("id"));
  if (!canModify(me, current.ownerId)) return c.json({ error: "forbidden" }, 403);
  const [json] = await serializeLinks(platform, me, [current]);
  await platform.db.delete(linkTags).where(eq(linkTags.linkId, current.id));
  await platform.db.delete(links).where(eq(links.id, current.id));
  await audit(c, { action: "link.delete", entityType: "link", entityId: current.id, data: { before: await auditSnapshot(platform.db, json!) } });
  return c.json({ ok: true });
});
