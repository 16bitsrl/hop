import { Hono, type Context } from "hono";
import { requireRole } from "../auth/permissions";
import type { AppEnv } from "../env";

/** Preview images uploaded for the social share card (D3). Stored in the blob store, served publicly. */
export const mediaRoutes = new Hono<AppEnv>();

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };

/** Checks the first bytes so a file cannot pretend to be an image. */
function looksLike(type: string, b: Uint8Array): boolean {
  const starts = (...bytes: number[]) => bytes.every((v, i) => b[i] === v);
  switch (type) {
    case "image/png":
      return starts(0x89, 0x50, 0x4e, 0x47);
    case "image/jpeg":
      return starts(0xff, 0xd8, 0xff);
    case "image/gif":
      return starts(0x47, 0x49, 0x46, 0x38);
    case "image/webp":
      return starts(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
    default:
      return false;
  }
}

/** POST /api/media with the raw image as body. Returns `{ url }`. */
mediaRoutes.post("/media", requireRole("admin", "member"), async (c) => {
  const type = (c.req.header("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  const ext = TYPES[type];
  if (!ext) return c.json({ error: "unsupported_image" }, 400);
  const body = new Uint8Array(await c.req.arrayBuffer());
  if (body.byteLength === 0 || !looksLike(type, body)) return c.json({ error: "unsupported_image" }, 400);
  if (body.byteLength > MAX_BYTES) return c.json({ error: "image_too_large" }, 400);
  const file = `${crypto.randomUUID()}.${ext}`;
  await c.var.platform.blobs.put(`media/${file}`, body, type);
  return c.json({ url: `${c.var.platform.config.appUrl}/media/${file}` }, 201);
});

/** GET /media/<file> on the app host. Public and cached for a year (the name never changes). */
export async function serveMedia(c: Context<AppEnv>): Promise<Response> {
  const file = c.req.param("file") ?? "";
  if (!/^[a-f0-9-]{36}\.(png|jpg|gif|webp)$/.test(file)) return c.notFound();
  const blob = await c.var.platform.blobs.get(`media/${file}`);
  if (!blob) return c.notFound();
  return new Response(blob.body, {
    headers: {
      "content-type": blob.contentType,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
