import { createApp } from "./app";
import { cloudflarePlatform, type CloudflareEnv } from "./platform/cloudflare";
import { authSecretProblem } from "./platform/secret";

/** Plain page for an installation that cannot run safely; the details also go to the logs. */
function misconfigured(problem: string): Response {
  console.error(`hop is not configured: ${problem}`);
  return new Response(`hop is not configured: ${problem}\n\nSet it as a secret (wrangler secret put AUTH_SECRET) and deploy again.\n`, {
    status: 500,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export default {
  fetch(req: Request, env: CloudflareEnv, ctx: ExecutionContext) {
    // A missing or short secret would make every session and token guessable: refuse to run.
    const problem = authSecretProblem(env.AUTH_SECRET);
    if (problem) return misconfigured(problem);
    const app = createApp({
      platform: () => cloudflarePlatform(env, ctx),
      serveAssets: (r) => env.ASSETS.fetch(r),
    });
    return app.fetch(req, env, ctx);
  },
  async scheduled(_event: ScheduledController, env: CloudflareEnv, ctx: ExecutionContext) {
    const problem = authSecretProblem(env.AUTH_SECRET);
    if (problem) {
      console.error(`scheduled jobs skipped, hop is not configured: ${problem}`);
      return;
    }
    // Periodic jobs (broken link checks, data retention) are registered by their modules.
    const { runScheduledJobs } = await import("./jobs");
    ctx.waitUntil(runScheduledJobs(cloudflarePlatform(env, ctx)));
  },
} satisfies ExportedHandler<CloudflareEnv>;
