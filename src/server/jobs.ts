import type { Platform } from "./platform/types";
import { checkDueLinks } from "./links/health";
import { pruneLinkPasswordAttempts } from "./redirect/attempts";
import { pruneOldClicks } from "./stats/retention";

/** Runs every periodic job. Called by the Cron Trigger (Workers) or a timer (Node). */
export async function runScheduledJobs(platform: Platform): Promise<void> {
  await pruneOldClicks(platform);
  await pruneLinkPasswordAttempts(platform.db).catch((e) => console.error("password attempts cleanup failed", e));
  await checkDueLinks(platform).catch((e) => console.error("link health job failed", e));
}
