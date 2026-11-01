import { createApp } from "./app";
import { cloudflarePlatform, type CloudflareEnv } from "./platform/cloudflare";

export default {
  fetch(req: Request, env: CloudflareEnv, ctx: ExecutionContext) {
    const app = createApp({
      platform: () => cloudflarePlatform(env, ctx),
      serveAssets: (r) => env.ASSETS.fetch(r),
    });
    return app.fetch(req, env, ctx);
  },
  async scheduled(_event: ScheduledController, env: CloudflareEnv, ctx: ExecutionContext) {
    // Periodic jobs (broken link checks, data retention) are registered by their modules.
    const { runScheduledJobs } = await import("./jobs");
    ctx.waitUntil(runScheduledJobs(cloudflarePlatform(env, ctx)));
  },
} satisfies ExportedHandler<CloudflareEnv>;
