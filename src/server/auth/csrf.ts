import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";

/**
 * Requests that change something and carry a browser cookie must come from the app itself.
 * SameSite cookies do not stop a page on a sibling subdomain (same site, other origin), so the
 * Origin header (or, when a browser omits it, the Referer) has to match the app's origin.
 *
 * Exempt: reads, requests with an API key (no cookie involved), and the single sign-on callback, which the
 * identity provider may send from its own origin and which Better Auth protects with its own state.
 */
export const csrfGuard = createMiddleware<AppEnv>(async (c, next) => {
  const method = c.req.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();
  if (c.req.header("authorization")?.toLowerCase().startsWith("bearer ")) return next();
  if (!c.req.header("cookie")) return next();
  if (c.req.path.startsWith("/api/auth/callback/")) return next();

  const appOrigin = new URL(c.var.platform.config.appUrl).origin;
  const origin = c.req.header("origin");
  let from: string | null = null;
  if (origin) from = origin;
  else {
    const referer = c.req.header("referer");
    if (referer) from = URL.canParse(referer) ? new URL(referer).origin : null;
  }
  if (from !== appOrigin) return c.json({ error: "bad_origin" }, 403);
  return next();
});
