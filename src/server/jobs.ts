import type { Platform } from "./platform/types";
import { checkDueLinks } from "./links/health";
import { pruneLinkPasswordAttempts } from "./redirect/attempts";
import { pruneOldClicks } from "./stats/retention";

export type Job = { name: string; run: () => Promise<unknown> | unknown };

/** Runs the jobs one after the other. A job that fails is logged and does not stop the others. */
export async function runJobs(jobs: Job[]): Promise<void> {
  for (const job of jobs) {
    try {
      await job.run();
    } catch (e) {
      console.error(`scheduled job "${job.name}" failed`, e);
    }
  }
}

/** Runs every periodic job. Called by the Cron Trigger (Workers) or a timer (Node). */
export async function runScheduledJobs(platform: Platform): Promise<void> {
  await runJobs([
    { name: "click retention", run: () => pruneOldClicks(platform) },
    { name: "password attempts cleanup", run: () => pruneLinkPasswordAttempts(platform.db) },
    { name: "link health", run: () => checkDueLinks(platform) },
  ]);
}
