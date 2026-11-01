import { Hono } from "hono";
import type { AppEnv } from "./env";
import type { Platform } from "./platform/types";
import { apiRoutes } from "./routes";
import { handleShortDomain } from "./redirect/handler";
import { serveMedia } from "./routes/media";

/**
 * Builds the HTTP app. `serveAssets` serves the SPA (and static files) on the app host.
 * Requests to any other host are treated as short links.
 */
export function createApp(opts: {
  platform: (req: Request) => Platform;
  serveAssets: (req: Request) => Promise<Response>;
}) {
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    c.set("platform", opts.platform(c.req.raw));
    c.set("user", null);
    await next();
  });

  app.all("*", async (c, next) => {
    const host = new URL(c.req.url).host;
    if (host !== c.var.platform.config.appHost) return handleShortDomain(c);
    await next();
  });

  app.get("/healthz", (c) => c.json({ ok: true }));
  app.route("/api", apiRoutes);
  app.get("/media/:file", serveMedia);

  app.all("*", (c) => opts.serveAssets(c.req.raw));

  return app;
}
