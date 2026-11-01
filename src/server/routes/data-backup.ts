import { and, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireRole } from "../auth/permissions";
import { countUsers, randomToken, sha256Hex } from "../auth/users";
import { domains, folders, linkTags, links, tags, user, verification } from "../db/schema";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { runRawBatch } from "../lib/batch";
import { fail, parseJson } from "../lib/validate";
import { backupStream, insertStatements, tableCounts, validateRows, type BackupRow } from "../data/backup";
import { toCsv } from "../stats/csv";

export const dataBackupRoutes = new Hono<AppEnv>();

const admin = requireRole("admin");
const dateStamp = () => new Date().toISOString().slice(0, 10);

/** Full backup as NDJSON (`?gzip=1` compresses it). */
dataBackupRoutes.get("/data/backup", admin, async (c) => {
  const gzip = c.req.query("gzip") === "1";
  await audit(c, { action: "data.export", entityType: "data", entityId: "backup", data: { gzip } });
  let body: ReadableStream<Uint8Array> = backupStream(c.var.platform.db);
  if (gzip) body = body.pipeThrough(new CompressionStream("gzip") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Response(body, {
    headers: {
      "content-type": gzip ? "application/gzip" : "application/x-ndjson; charset=utf-8",
      "content-disposition": `attachment; filename="hop-backup-${dateStamp()}.ndjson${gzip ? ".gz" : ""}"`,
      "cache-control": "no-store",
    },
  });
});

/** Every link as a spreadsheet-friendly CSV. */
dataBackupRoutes.get("/data/links.csv", admin, async (c) => {
  const { db, config } = c.var.platform;
  const [rows, domainRows, owners, folderRows, tagRows] = await Promise.all([
    db.select().from(links).orderBy(links.createdAt),
    db.select().from(domains),
    db.select({ id: user.id, email: user.email }).from(user),
    db.select({ id: folders.id, name: folders.name }).from(folders),
    db.select({ linkId: linkTags.linkId, name: tags.name }).from(linkTags).innerJoin(tags, eq(tags.id, linkTags.tagId)),
  ]);
  const host = new Map(domainRows.map((d) => [d.id, d.host]));
  const owner = new Map(owners.map((o) => [o.id, o.email]));
  const folder = new Map(folderRows.map((f) => [f.id, f.name]));
  const tagsOf = new Map<string, string[]>();
  for (const t of tagRows) tagsOf.set(t.linkId, [...(tagsOf.get(t.linkId) ?? []), t.name]);
  const iso = (d: Date | null) => (d ? d.toISOString() : "");
  const scheme = new URL(config.appUrl).protocol;
  const csv = toCsv([
    ["domain", "slug", "short_url", "url", "title", "notes", "owner", "folder", "tags", "redirect_type", "enabled", "clicks", "last_click", "created", "expires", "health"],
    ...rows.map((l) => [
      host.get(l.domainId) ?? "",
      l.slug,
      `${scheme}//${host.get(l.domainId) ?? ""}/${l.slug}`,
      l.url,
      l.title,
      l.notes,
      l.ownerId ? (owner.get(l.ownerId) ?? "") : "",
      l.folderId ? (folder.get(l.folderId) ?? "") : "",
      (tagsOf.get(l.id) ?? []).join(", "),
      l.redirectType,
      l.enabled ? "yes" : "no",
      l.clickCount,
      iso(l.lastClickedAt),
      iso(l.createdAt),
      iso(l.expiresAt),
      l.healthStatus,
    ]),
  ]);
  await audit(c, { action: "data.export", entityType: "data", entityId: "links.csv", data: { rows: rows.length } });
  return c.body(csv, 200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="hop-links-${dateStamp()}.csv"`,
    "cache-control": "no-store",
  });
});

/* ------------------------------------------------------------------ */
/* Restore into an empty installation                                  */
/* ------------------------------------------------------------------ */

/*
 * An installation is empty until its first account exists. Restoring is therefore open
 * (like first-run setup) but only while there are no users; a short-lived token, kept in the
 * verification table (not part of a backup), ties the chunks of one restore together.
 */
const RESTORE_ID = "hop-restore";
const RESTORE_TTL = 2 * 3_600_000;

async function restoreSession(c: { req: { header(n: string): string | undefined }; var: { platform: { db: import("../platform/types").DB } } }) {
  const token = c.req.header("x-restore-token");
  if (!token) return null;
  const hash = await sha256Hex(token);
  const row = await c.var.platform.db
    .select()
    .from(verification)
    .where(and(eq(verification.identifier, RESTORE_ID), eq(verification.value, hash), gt(verification.expiresAt, new Date())))
    .get();
  return row ?? null;
}

dataBackupRoutes.post("/restore/start", async (c) => {
  const { db } = c.var.platform;
  if ((await countUsers(c.var.platform)) > 0) return fail(c, 409, "not_empty");
  const token = randomToken();
  await db.delete(verification).where(eq(verification.identifier, RESTORE_ID));
  await db.insert(verification).values({
    id: crypto.randomUUID(),
    identifier: RESTORE_ID,
    value: await sha256Hex(token),
    expiresAt: new Date(Date.now() + RESTORE_TTL),
  });
  return c.json({ token });
});

const rowsBody = z.object({ rows: z.array(z.object({ t: z.string(), r: z.record(z.string(), z.union([z.string(), z.number(), z.null()])) })).max(1000) });

dataBackupRoutes.post("/restore/rows", async (c) => {
  if (!(await restoreSession(c))) return fail(c, 401, "unauthorized");
  const { rows } = await parseJson(c, rowsBody);
  const problem = validateRows(rows as BackupRow[]);
  if (problem) return fail(c, 400, problem);
  try {
    await runRawBatch(c.var.platform.db, insertStatements(rows as BackupRow[]));
  } catch (e) {
    console.error("restore failed", e);
    return fail(c, 409, "restore_failed");
  }
  return c.json({ inserted: rows.length });
});

dataBackupRoutes.post("/restore/finish", async (c) => {
  const session = await restoreSession(c);
  if (!session) return fail(c, 401, "unauthorized");
  const { db } = c.var.platform;
  const { counts } = await parseJson(c, z.object({ counts: z.record(z.string(), z.number()) }));
  const actual = await tableCounts(db);
  const mismatch = Object.entries(counts).filter(([t, n]) => (actual[t] ?? 0) !== n);
  if (mismatch.length) return c.json({ error: "restore_incomplete", tables: mismatch.map(([t]) => t) }, 409);
  await db.delete(verification).where(eq(verification.identifier, RESTORE_ID));
  await audit(c, { action: "data.restore", entityType: "data", entityId: "backup", data: { counts: actual } });
  return c.json({ ok: true, counts: actual });
});


