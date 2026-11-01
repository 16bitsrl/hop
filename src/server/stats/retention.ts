import { sql } from "drizzle-orm";
import { getSetting } from "../lib/settings";
import type { DB, Platform } from "../platform/types";

export type StatsSettings = { retentionDays: number | null };
export const defaultStatsSettings: StatsSettings = { retentionDays: null };
export const getStatsSettings = (db: DB) => getSetting(db, "stats", defaultStatsSettings);

const BATCH = 5000;
const MAX_BATCHES = 40;

/**
 * Deletes clicks older than the retention window (nothing when it is empty).
 * `links.clickCount` is the lifetime counter and is left alone.
 */
export async function pruneOldClicks(platform: Platform, now = Date.now()): Promise<void> {
  const { db } = platform;
  const { retentionDays } = await getStatsSettings(db);
  if (!retentionDays || retentionDays < 1) return;
  const cutoff = now - retentionDays * 86_400_000;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const [left] = await db.all<{ id: number }>(sql`SELECT id FROM clicks WHERE ts < ${cutoff} LIMIT 1`);
    if (!left) return;
    await db.run(sql`DELETE FROM clicks WHERE id IN (SELECT id FROM clicks WHERE ts < ${cutoff} LIMIT ${BATCH})`);
  }
}
