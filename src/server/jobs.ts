import type { Platform } from "./platform/types";
import { pruneOldClicks } from "./stats/retention";

/** Runs every periodic job. Called by the Cron Trigger (Workers) or a timer (Node). */
export async function runScheduledJobs(platform: Platform): Promise<void> {
  await pruneOldClicks(platform);
}
