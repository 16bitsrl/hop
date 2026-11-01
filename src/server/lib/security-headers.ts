/**
 * Headers for everything served on the app host (the single-page app, the API, media).
 * The short-domain pages build their own, stricter policy (see redirect/pages.ts).
 *
 * `dev` is the Vite dev server only: its hot reload needs an inline script and a websocket.
 */
export function appSecurityHeaders(opts: { https: boolean; dev?: boolean }): Record<string, string> {
  const csp = [
    "default-src 'self'",
    // The built app has no inline script; the theme is applied by /theme-init.js.
    `script-src 'self'${opts.dev ? " 'unsafe-inline'" : ""}`,
    // Components set style attributes (chart sizes, progress bars), which need inline styles.
    "style-src 'self' 'unsafe-inline'",
    // Own images, QR codes (data/blob) and https images for social previews and avatars.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self'${opts.dev ? " ws: wss:" : ""}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  return {
    "content-security-policy": csp,
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    ...(opts.https ? { "strict-transport-security": "max-age=31536000" } : {}),
  };
}

/** The response with the headers added (responses from fetch or the assets binding have read-only headers). */
export function withHeaders(res: Response, headers: Record<string, string>): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  return out;
}
