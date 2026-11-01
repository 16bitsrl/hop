import { Hono } from "hono";
import type { AppEnv } from "../env";

/**
 * Test-only fixture pages, mounted at /api/_test. 404 unless TEST_MODE is on.
 *   GET /page                   a page with a title and description (page metadata lookup, A3)
 *   GET /status/:code           answers with that HTTP status (broken link check, J5)
 *   GET /status-no-head/:code   like /status, but refuses HEAD with 405
 */
export const testPagesRoutes = new Hono<AppEnv>();

testPagesRoutes.get("/page", (c) => {
  if (!c.var.platform.config.testMode) return c.notFound();
  return c.html(
    `<!doctype html><html><head><title>Hop test page</title>` +
      `<meta property="og:description" content="A page used by the tests.">` +
      `</head><body>Hello</body></html>`,
  );
});

const statusCode = (raw: string) => {
  const code = Number(raw);
  return Number.isInteger(code) && code >= 200 && code <= 599 ? code : 400;
};

testPagesRoutes.get("/status/:code", (c) => {
  if (!c.var.platform.config.testMode) return c.notFound();
  return new Response(null, { status: statusCode(c.req.param("code")) });
});

testPagesRoutes.get("/status-no-head/:code", (c) => {
  if (!c.var.platform.config.testMode) return c.notFound();
  if (c.req.raw.method === "HEAD") return new Response(null, { status: 405 });
  return new Response("body", { status: statusCode(c.req.param("code")) });
});
