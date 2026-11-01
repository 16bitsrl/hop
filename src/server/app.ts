import { Hono } from "hono";
import type { AppEnv } from "./env";
import type { Platform } from "./platform/types";
import { apiRoutes } from "./routes";
import { handleShortDomain } from "./redirect/handler";
import { serveMedia } from "./routes/media";
import { checkDatabase, healthReport } from "./ops/health";
import { appSecurityHeaders, withHeaders } from "./lib/security-headers";
import { collectStats, formatMetrics, metricsAuthorized } from "./ops/metrics";

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
    const dev = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
    c.res = withHeaders(c.res, appSecurityHeaders({ https: c.var.platform.config.appUrl.startsWith("https:"), dev }));
  });

  app.get("/healthz", async (c) => {
    const { status, body } = healthReport(await checkDatabase(c.var.platform.db));
    return c.json(body, status);
  });
  app.get("/metrics", async (c) => {
    const token = c.var.platform.config.metricsToken;
    if (!token) return c.notFound();
    if (!metricsAuthorized(c.req.header("authorization"), token)) {
      return c.text("unauthorized", 401, { "www-authenticate": 'Bearer realm="metrics"' });
    }
    const text = formatMetrics(await collectStats(c.var.platform.db));
    return c.body(text, 200, { "content-type": "text/plain; version=0.0.4; charset=utf-8", "cache-control": "no-store" });
  });
  app.route("/api", apiRoutes);
  app.get("/media/:file", serveMedia);

  app.all("*", (c) => opts.serveAssets(c.req.raw));

  return app;
}
