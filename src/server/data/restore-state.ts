import { and, gt, inArray, sql } from "drizzle-orm";
import { verification } from "../db/schema";
import type { DB } from "../platform/types";

/*
 * A restore is tracked by one row in the verification table (which is not part of a backup):
 *   hop-restore         started, nothing loaded yet. First-run setup simply cancels it.
 *   hop-restore-active  data is being loaded: this restore owns the installation, setup is refused.
 * The row's expiry slides forward with every chunk, so an abandoned restore frees the installation.
 */
export const RESTORE_PENDING = "hop-restore";
export const RESTORE_ACTIVE = "hop-restore-active";
export const RESTORE_TTL = 15 * 60_000;

const ids = [RESTORE_PENDING, RESTORE_ACTIVE];

export async function restoreRunning(db: DB, kinds: string[] = ids): Promise<boolean> {
  const row = await db
    .select({ id: verification.id })
    .from(verification)
    .where(and(inArray(verification.identifier, kinds), gt(verification.expiresAt, new Date())))
    .get();
  return !!row;
}

/** Forgets every restore token (running or expired). */
export async function clearRestores(db: DB) {
  await db.delete(verification).where(inArray(verification.identifier, ids));
}

export async function clearExpiredRestores(db: DB) {
  await db.delete(verification).where(and(inArray(verification.identifier, ids), sql`${verification.expiresAt} <= ${Date.now()}`));
}
