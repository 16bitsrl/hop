import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireRole, sessionOnly } from "../auth/permissions";
import { setupTokenOk } from "../auth/setup-token";
import { countUsers, randomToken, sha256Hex } from "../auth/users";
import { clearExpiredRestores, clearRestores, restoreRunning, RESTORE_ACTIVE, RESTORE_PENDING, RESTORE_TTL } from "../data/restore-state";
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
dataBackupRoutes.get("/data/backup", admin, sessionOnly, async (c) => {
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
 * (like first-run setup, and guarded by the same optional SETUP_TOKEN) but only while there are no
 * users. A short-lived token, kept in the verification table (not part of a backup), ties the chunks
 * of one restore together; see data/restore-state.ts for how it interacts with first-run setup.
 */
async function restoreSession(c: { req: { header(n: string): string | undefined }; var: { platform: { db: import("../platform/types").DB } } }) {
  const token = c.req.header("x-restore-token");
  if (!token) return null;
  const hash = await sha256Hex(token);
  const row = await c.var.platform.db
    .select()
    .from(verification)
    .where(
      and(
        inArray(verification.identifier, [RESTORE_PENDING, RESTORE_ACTIVE]),
        eq(verification.value, hash),
        gt(verification.expiresAt, new Date()),
      ),
    )
    .get();
  return row ?? null;
}

dataBackupRoutes.post("/restore/start", async (c) => {
  const { db, config } = c.var.platform;
  if ((await countUsers(c.var.platform)) > 0) return fail(c, 409, "not_empty");
  if (!(await setupTokenOk(config.setupToken, c.req.header("x-setup-token")))) return fail(c, 403, "invalid_setup_token");
  await clearExpiredRestores(db);
  if (await restoreRunning(db)) return fail(c, 409, "restore_in_progress");
  const token = randomToken();
  const id = crypto.randomUUID();
  await db.insert(verification).values({
    id,
    identifier: RESTORE_PENDING,
    value: await sha256Hex(token),
    expiresAt: new Date(Date.now() + RESTORE_TTL),
  });
  // Two starts at the same moment: neither wins.
  const rows = await db.select({ id: verification.id }).from(verification).where(inArray(verification.identifier, [RESTORE_PENDING, RESTORE_ACTIVE]));
  if (rows.length > 1) {
    await db.delete(verification).where(eq(verification.id, id));
    return fail(c, 409, "restore_in_progress");
  }
  return c.json({ token });
});

const rowsBody = z.object({ rows: z.array(z.object({ t: z.string(), r: z.record(z.string(), z.union([z.string(), z.number(), z.null()])) })).max(1000) });

dataBackupRoutes.post("/restore/rows", async (c) => {
  const { db } = c.var.platform;
  const session = await restoreSession(c);
  if (!session) return fail(c, 401, "unauthorized");
  const { rows } = await parseJson(c, rowsBody);
  const problem = validateRows(rows as BackupRow[]);
  if (problem) return fail(c, 400, problem);
  const expiresAt = Date.now() + RESTORE_TTL;
  if (session.identifier === RESTORE_PENDING) {
    // The first chunk claims the installation, atomically with the check that nobody has an account.
    await db.run(
      sql`update verification set identifier = ${RESTORE_ACTIVE}, expires_at = ${expiresAt} where id = ${session.id} and identifier = ${RESTORE_PENDING} and not exists (select 1 from user)`,
    );
    const claimed = await db.select({ identifier: verification.identifier }).from(verification).where(eq(verification.id, session.id)).get();
    if (claimed?.identifier !== RESTORE_ACTIVE) return fail(c, 401, "unauthorized");
  } else {
    await db.update(verification).set({ expiresAt: new Date(expiresAt) }).where(eq(verification.id, session.id));
  }
  try {
    await runRawBatch(db, insertStatements(rows as BackupRow[]));
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
  // A restore that never loaded anything can only finish while the installation is still empty.
  if (session.identifier === RESTORE_PENDING && (await countUsers(c.var.platform)) > 0) return fail(c, 401, "unauthorized");
  const { counts } = await parseJson(c, z.object({ counts: z.record(z.string(), z.number()) }));
  const actual = await tableCounts(db);
  const mismatch = Object.entries(counts).filter(([t, n]) => (actual[t] ?? 0) !== n);
  if (mismatch.length) return c.json({ error: "restore_incomplete", tables: mismatch.map(([t]) => t) }, 409);
  await clearRestores(db);
  await audit(c, { action: "data.restore", entityType: "data", entityId: "backup", data: { counts: actual } });
  return c.json({ ok: true, counts: actual });
});
