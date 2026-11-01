import { Hono } from "hono";
import type { AppEnv } from "../env";

/** Test-only page with a title and description, used to try the page metadata lookup (A3). 404 unless TEST_MODE is on. */
export const testPagesRoutes = new Hono<AppEnv>();

testPagesRoutes.get("/page", (c) => {
  if (!c.var.platform.config.testMode) return c.notFound();
  return c.html(
    `<!doctype html><html><head><title>Hop test page</title>` +
      `<meta property="og:description" content="A page used by the tests.">` +
      `</head><body>Hello</body></html>`,
  );
});
