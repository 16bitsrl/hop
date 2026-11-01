import { and, eq, lt, sql } from "drizzle-orm";
import { linkPasswordAttempts } from "../db/schema";
import type { DB } from "../platform/types";

/** A visitor may try this many passwords on one link per window; the next try is refused without checking. */
export const MAX_PASSWORD_ATTEMPTS = 5;
export const ATTEMPT_WINDOW_MS = 15 * 60_000;

/** Stable, anonymous id of a client address (the address itself is never stored). */
export async function ipDigest(secret: string, ip: string | null): Promise<string> {
  const data = new TextEncoder().encode(`link-password|${secret}|${ip ?? "unknown"}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Counts one password attempt, atomically, before the password is checked (so parallel guesses cannot
 * slip past the limit). Returns how many seconds to wait when the visitor is out of attempts.
 */
export async function takePasswordAttempt(db: DB, linkId: string, ipHash: string, now = Date.now()): Promise<{ blockedFor: number | null }> {
  const expired = now - ATTEMPT_WINDOW_MS;
  const [row] = await db
    .insert(linkPasswordAttempts)
    .values({ linkId, ipHash, count: 1, windowStart: now })
    .onConflictDoUpdate({
      target: [linkPasswordAttempts.linkId, linkPasswordAttempts.ipHash],
      set: {
        count: sql`case when ${linkPasswordAttempts.windowStart} <= ${expired} then 1 else ${linkPasswordAttempts.count} + 1 end`,
        windowStart: sql`case when ${linkPasswordAttempts.windowStart} <= ${expired} then ${now} else ${linkPasswordAttempts.windowStart} end`,
      },
    })
    .returning({ count: linkPasswordAttempts.count, windowStart: linkPasswordAttempts.windowStart });
  if (row && row.count > MAX_PASSWORD_ATTEMPTS) {
    return { blockedFor: Math.max(1, Math.ceil((row.windowStart + ATTEMPT_WINDOW_MS - now) / 1000)) };
  }
  return { blockedFor: null };
}

/** The right password was entered: forget earlier mistakes. */
export async function clearPasswordAttempts(db: DB, linkId: string, ipHash: string) {
  await db.delete(linkPasswordAttempts).where(and(eq(linkPasswordAttempts.linkId, linkId), eq(linkPasswordAttempts.ipHash, ipHash)));
}

export async function pruneLinkPasswordAttempts(db: DB, now = Date.now()) {
  await db.delete(linkPasswordAttempts).where(lt(linkPasswordAttempts.windowStart, now - ATTEMPT_WINDOW_MS));
}
