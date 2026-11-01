import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

/**
 * Serves the built SPA from `dir`. Anything that is not a file falls back to index.html,
 * like the Workers assets binding in single-page-application mode.
 */
export function staticHandler(dir: string): (req: Request) => Promise<Response> {
  const root = path.resolve(dir);

  const find = async (pathname: string): Promise<string | null> => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return null;
    }
    const file = path.resolve(root, `.${decoded}`);
    if (file !== root && !file.startsWith(root + path.sep)) return null;
    const info = await stat(file).catch(() => null);
    return info?.isFile() ? file : null;
  };

  return async (req) => {
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    const { pathname } = new URL(req.url);
    const file = (await find(pathname)) ?? path.join(root, "index.html");
    let body: Buffer;
    try {
      body = await readFile(file);
    } catch {
      return new Response("Not found", { status: 404 });
    }
    const hashed = /\/assets\//.test(file) && file !== path.join(root, "index.html");
    return new Response(req.method === "HEAD" ? null : new Uint8Array(body), {
      headers: {
        "content-type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
        "content-length": String(body.byteLength),
        "cache-control": hashed ? "public, max-age=31536000, immutable" : "no-cache",
      },
    });
  };
}
