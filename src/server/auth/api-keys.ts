import { and, eq, isNull, lt, or } from "drizzle-orm";
import { apiKeys, user } from "../db/schema";
import type { DB } from "../platform/types";
import { randomToken, sha256Hex } from "./users";

/** Personal API keys (H1): `hop_<random>`. Only a SHA-256 hash and a short prefix are stored. */

export const KEY_PREFIX = "hop_";
const TOUCH_EVERY_MS = 60_000;

export function newKeySecret(): string {
  return `${KEY_PREFIX}${randomToken(32)}`;
}

/** What the list shows to help recognise a key. */
export const displayPrefix = (secret: string) => secret.slice(0, KEY_PREFIX.length + 4);

export function bearerKey(header: string | null | undefined): string | null {
  const m = /^Bearer\s+(hop_\S+)$/i.exec(header?.trim() ?? "");
  return m ? m[1]! : null;
}

/** The user behind a key, or null when the key is unknown, revoked, or its user is disabled. */
export async function userForKey(db: DB, secret: string, now = Date.now()) {
  const hash = await sha256Hex(secret);
  const row = await db
    .select({ key: apiKeys, user })
    .from(apiKeys)
    .innerJoin(user, eq(user.id, apiKeys.userId))
    .where(and(eq(apiKeys.hash, hash), isNull(apiKeys.revokedAt)))
    .get();
  if (!row || row.user.disabled) return null;
  // At most one write a minute per key.
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date(now) })
    .where(and(eq(apiKeys.id, row.key.id), or(isNull(apiKeys.lastUsedAt), lt(apiKeys.lastUsedAt, new Date(now - TOUCH_EVERY_MS)))));
  return row.user;
}
