import { sql } from "drizzle-orm";
import type { DB } from "../platform/types";

/** What `/healthz` says: ok only when the database answers. */
export function healthReport(dbOk: boolean): { status: 200 | 503; body: { ok: boolean; db: boolean } } {
  return { status: dbOk ? 200 : 503, body: { ok: dbOk, db: dbOk } };
}

/** Asks the database a trivial question (with a time limit). Never throws. */
export async function checkDatabase(db: DB, timeoutMs = 3000): Promise<boolean> {
  try {
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs));
    const rows = await Promise.race([db.all<{ ok: number }>(sql`select 1 as ok`), timeout]);
    return rows.length === 1;
  } catch {
    return false;
  }
}
