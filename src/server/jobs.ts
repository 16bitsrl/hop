import type { Platform } from "./platform/types";

/** Runs every periodic job. Called by the Cron Trigger (Workers) or a timer (Node). */
export async function runScheduledJobs(_platform: Platform): Promise<void> {}
