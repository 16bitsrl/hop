/**
 * Destination site icons for the links list. The server fetches them, so the browser
 * never contacts the destinations and no third-party icon service learns about them.
 */
import { safeFetch } from "../lib/safe-fetch";
import { decodeEntities, readHtmlHead, tagAttributes } from "./meta";

const MAX_ICON_BYTES = 100 * 1024;
/** One deadline for the whole lookup: home page plus every icon tried. */
const LOOKUP_MS = 8000;
const MAX_DECLARED = 2;
const MAX_TOUCH = 1;
const USER_AGENT = "Mozilla/5.0 (compatible; hop-link-preview/1.0)";

/** Icon addresses to try, best first: up to two declared icons, one touch icon, then /favicon.ico. */
export function iconCandidates(html: string, base: URL): string[] {
  const icons: string[] = [];
  const touch: string[] = [];
  for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = tagAttributes(tag[0]);
    const rel = (attrs.get("rel") ?? "").toLowerCase().split(/\s+/);
    const href = webUrl(decodeEntities(attrs.get("href") ?? "").trim(), base);
    if (!href) continue;
    if (rel.includes("icon")) {
      if (icons.length < MAX_DECLARED && !icons.includes(href)) icons.push(href);
    } else if (rel.includes("apple-touch-icon") || rel.includes("apple-touch-icon-precomposed")) {
      if (touch.length < MAX_TOUCH && !touch.includes(href)) touch.push(href);
    }
    if (icons.length >= MAX_DECLARED && touch.length >= MAX_TOUCH) break;
  }
  const out: string[] = [];
  for (const href of [...icons, ...touch, new URL("/favicon.ico", base).href]) if (!out.includes(href)) out.push(href);
  return out;
}

function webUrl(href: string, base: URL): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

const startsWith = (b: Uint8Array, sig: (number | string)[], at = 0) =>
  sig.length > 0 && b.length >= at + sig.length && sig.every((v, i) => b[at + i] === (typeof v === "string" ? v.charCodeAt(0) : v));

/** The image format, read from the bytes themselves; null for anything but common raster icons. */
export function rasterType(b: Uint8Array): string | null {
  if (startsWith(b, [0x89, "P", "N", "G"])) return "image/png";
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(b, ["G", "I", "F", "8"])) return "image/gif";
  if (startsWith(b, ["R", "I", "F", "F"]) && startsWith(b, ["W", "E", "B", "P"], 8)) return "image/webp";
  if (startsWith(b, [0, 0, 1, 0])) return "image/x-icon";
  return null;
}

export type SiteIcon = { type: string; body: Uint8Array<ArrayBuffer> };

/**
 * The icon of the site at `origin`. "none" when the site has no usable icon,
 * "failed" when it could not be reached in time. Never throws.
 */
export async function fetchSiteIcon(origin: string, opts: { allowPrivate?: boolean } = {}): Promise<SiteIcon | "none" | "failed"> {
  const signal = AbortSignal.timeout(LOOKUP_MS);
  const get = (url: string | URL, accept: string, onFinalUrl?: (u: URL) => void) =>
    safeFetch(url, { headers: { accept, "user-agent": USER_AGENT }, signal, allowPrivate: opts.allowPrivate, onFinalUrl });
  try {
    // Relative icon addresses belong to the page that finally answered, after redirects.
    let base = new URL(origin);
    let html = "";
    const page = await get(base, "text/html,application/xhtml+xml", (u) => (base = u)).catch(() => null);
    if (!page && signal.aborted) return "failed";
    if (page?.ok && /html|xml/i.test(page.headers.get("content-type") ?? "html")) html = await readHtmlHead(page);
    else void page?.body?.cancel().catch(() => {});

    for (const url of iconCandidates(html, base)) {
      const res = await get(url, "image/*").catch(() => null);
      if (!res) {
        if (signal.aborted) return "failed";
        continue;
      }
      const body = res.ok ? await readCapped(res, MAX_ICON_BYTES) : (void res.body?.cancel().catch(() => {}), null);
      const type = body && rasterType(body);
      if (type) return { type, body: body };
    }
    return "none";
  } catch {
    return signal.aborted ? "failed" : "none";
  }
}

/** The whole body, or null as soon as it grows past `max` bytes. */
async function readCapped(res: Response, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (Number(res.headers.get("content-length") ?? 0) > max) {
    void res.body?.cancel().catch(() => {});
    return null;
  }
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      void reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return size > 0 ? out : null;
}
