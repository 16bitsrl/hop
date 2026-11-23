import { and, asc, eq, gt, inArray, isNull, lt } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { bearerKey } from "../auth/api-keys";
import { requireUser, sessionOnly } from "../auth/permissions";
import { sha256Hex } from "../auth/users";
import { apiKeys, cliLogins } from "../db/schema";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { fail, parseJson } from "../lib/validate";
import type { DB } from "../platform/types";
import { MAX_ACTIVE_KEYS } from "./api-keys";

/**
 * Sign-in from the command line app (`hop login`).
 *
 *   POST /cli/login  { name, keyHash, prefix }  -> { code, verifyUrl, expiresIn, interval }   (no sign-in)
 *   POST /cli/login/poll  { keyHash }           -> { status: pending | approved | denied | expired }
 *   GET  /cli/login/:code                       the pending request, for the page that asks to confirm
 *   POST /cli/login/:code/approve               the key becomes an API key of the signed-in person
 *   POST /cli/login/:code/deny
 *   POST /cli/logout                            revokes the key the request was made with (`hop logout`)
 *
 * The terminal generates the key and sends only its SHA-256 hash, so the key never travels to the
 * browser or rests on the server. Approving needs a signed-in session: a key cannot hand out keys.
 */
export const cliLoginRoutes = new Hono<AppEnv>();

const LIFETIME_MS = 10 * 60_000;
const POLL_SECONDS = 2;
/** Requests waiting at once, for the whole installation. */
const MAX_PENDING = 200;
/** No 0/O, 1/I/L: the code may be read aloud or typed by hand. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/** "abcd efgh", "abcdefgh" and "ABCD-EFGH" are the same code. */
function normalizeCode(value: string): string {
  const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.length === 8 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

const startBody = z.object({
  name: z.string().trim().min(1).max(60),
  keyHash: z.string().regex(/^[0-9a-f]{64}$/),
  prefix: z.string().regex(/^hop_[A-Za-z0-9_-]{4}$/),
});

cliLoginRoutes.post("/cli/login", async (c) => {
  const body = await parseJson(c, startBody);
  const { db, config } = c.var.platform;
  const now = Date.now();
  await db.delete(cliLogins).where(lt(cliLogins.expiresAt, new Date(now)));
  // Starting a request needs no sign-in, so the table is kept small: when it is full the oldest
  // requests make room. A burst of junk can then only cancel sign-ins in progress at that moment,
  // not lock everybody out for the next ten minutes.
  const waiting = await db.select({ id: cliLogins.id }).from(cliLogins).where(eq(cliLogins.status, "pending")).orderBy(asc(cliLogins.createdAt), asc(cliLogins.id));
  const excess = waiting.slice(0, Math.max(0, waiting.length - MAX_PENDING + 1)).map((r) => r.id);
  for (let i = 0; i < excess.length; i += 50) await db.delete(cliLogins).where(inArray(cliLogins.id, excess.slice(i, i + 50)));
  const [known, used] = await Promise.all([
    db.select({ id: cliLogins.id }).from(cliLogins).where(eq(cliLogins.keyHash, body.keyHash)).get(),
    db.select({ id: apiKeys.id }).from(apiKeys).where(eq(apiKeys.hash, body.keyHash)).get(),
  ]);
  if (known || used) return fail(c, 409, "key_exists");
  const code = newCode();
  // The time is set here, to the millisecond: the column's own default only counts seconds, too coarse to tell which request is the oldest.
  await db.insert(cliLogins).values({ id: crypto.randomUUID(), code, ...body, createdAt: new Date(now), expiresAt: new Date(now + LIFETIME_MS) });
  return c.json({ code, verifyUrl: `${config.appUrl}/cli/${code}`, expiresIn: LIFETIME_MS / 1000, interval: POLL_SECONDS }, 201);
});

cliLoginRoutes.post("/cli/login/poll", async (c) => {
  const { keyHash } = await parseJson(c, startBody.pick({ keyHash: true }));
  const row = await c.var.platform.db.select().from(cliLogins).where(eq(cliLogins.keyHash, keyHash)).get();
  if (!row) return c.json({ status: "expired" });
  if (row.status === "pending" && row.expiresAt.getTime() <= Date.now()) return c.json({ status: "expired" });
  return c.json({ status: row.status });
});

/** Signing out of the terminal: a key may always give itself up, that never widens what it can do. */
cliLoginRoutes.post("/cli/logout", requireUser, async (c) => {
  const secret = bearerKey(c.req.header("authorization"));
  if (c.var.authVia !== "key" || !secret) return fail(c, 403, "forbidden");
  const { db } = c.var.platform;
  const [row] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.hash, await sha256Hex(secret)), isNull(apiKeys.revokedAt)))
    .returning();
  if (row) await audit(c, { action: "key.revoke", entityType: "api_key", entityId: row.id, data: { name: row.name, prefix: row.prefix, ownerId: row.userId, source: "cli" } });
  return c.json({ ok: true });
});

cliLoginRoutes.use("/cli/login/:code", requireUser, sessionOnly);
cliLoginRoutes.use("/cli/login/:code/*", requireUser, sessionOnly);

const findPending = (db: DB, code: string) =>
  db
    .select()
    .from(cliLogins)
    .where(and(eq(cliLogins.code, normalizeCode(code)), eq(cliLogins.status, "pending"), gt(cliLogins.expiresAt, new Date())))
    .get();

cliLoginRoutes.get("/cli/login/:code", async (c) => {
  const row = await findPending(c.var.platform.db, c.req.param("code"));
  if (!row) return fail(c, 404, "invalid_cli_code");
  return c.json({ code: row.code, name: row.name, createdAt: row.createdAt });
});

cliLoginRoutes.post("/cli/login/:code/approve", async (c) => {
  const { db } = c.var.platform;
  const me = c.var.user!;
  const row = await findPending(db, c.req.param("code"));
  if (!row) return fail(c, 404, "invalid_cli_code");
  const active = await db.select({ id: apiKeys.id }).from(apiKeys).where(and(eq(apiKeys.userId, me.id), isNull(apiKeys.revokedAt)));
  if (active.length >= MAX_ACTIVE_KEYS) return fail(c, 409, "too_many_keys");
  // Only one of two approvals at the same moment wins.
  const [won] = await db.update(cliLogins).set({ status: "approved" }).where(and(eq(cliLogins.id, row.id), eq(cliLogins.status, "pending"))).returning();
  if (!won) return fail(c, 404, "invalid_cli_code");
  const [key] = await db
    .insert(apiKeys)
    .values({ id: crypto.randomUUID(), userId: me.id, name: row.name, prefix: row.prefix, hash: row.keyHash })
    .returning();
  await audit(c, { action: "key.create", entityType: "api_key", entityId: key!.id, data: { name: row.name, prefix: row.prefix, source: "cli" } });
  return c.json({ ok: true });
});

cliLoginRoutes.post("/cli/login/:code/deny", async (c) => {
  const { db } = c.var.platform;
  const row = await findPending(db, c.req.param("code"));
  if (!row) return fail(c, 404, "invalid_cli_code");
  await db.update(cliLogins).set({ status: "denied" }).where(and(eq(cliLogins.id, row.id), eq(cliLogins.status, "pending")));
  return c.json({ ok: true });
});
