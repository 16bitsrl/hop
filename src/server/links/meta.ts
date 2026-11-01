/** Page title and description for a destination (A3). */
import { isPrivateHost, safeFetch } from "../lib/safe-fetch";

export type PageMeta = { title: string | null; description: string | null; image: string | null };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const clean = (s: string | undefined | null): string | null => {
  const v = s ? decodeEntities(s).replace(/\s+/g, " ").trim() : "";
  return v ? v.slice(0, 500) : null;
};

/** Reads `<title>`, `og:title`, `og:description`, `description` and `og:image` from HTML. */
export function parseHtmlMeta(html: string): PageMeta {
  const metas = new Map<string, string>();
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = new Map<string, string>();
    for (const a of tag[0].matchAll(/([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attrs.set(a[1]!.toLowerCase(), a[2] ?? a[3] ?? a[4] ?? "");
    }
    const key = (attrs.get("property") ?? attrs.get("name"))?.toLowerCase();
    const content = attrs.get("content");
    if (key && content !== undefined && !metas.has(key)) metas.set(key, content);
  }
  const titleTag = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return {
    title: clean(titleTag) ?? clean(metas.get("og:title")),
    description: clean(metas.get("og:description")) ?? clean(metas.get("description")),
    image: clean(metas.get("og:image")),
  };
}

const MAX_BYTES = 256 * 1024;

export { isPrivateHost };

/** Fetches the page (5 s timeout, first 256 KB) and extracts its metadata. Never throws. */
export async function fetchPageMeta(
  url: string,
  opts: { allowPrivate?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<PageMeta | null> {
  try {
    const target = new URL(url);
    const res = await safeFetch(target, {
      headers: { accept: "text/html,application/xhtml+xml", "user-agent": "Mozilla/5.0 (compatible; hop-link-preview/1.0)" },
      signal: AbortSignal.timeout(5000),
      allowPrivate: opts.allowPrivate,
      fetchImpl: opts.fetchImpl,
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (type && !/html|xml/i.test(type)) return null;
    const reader = res.body?.getReader();
    if (!reader) return parseHtmlMeta((await res.text()).slice(0, MAX_BYTES));
    const decoder = new TextDecoder();
    let html = "";
    let received = 0;
    while (received < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    void reader.cancel().catch(() => {});
    return parseHtmlMeta(html);
  } catch {
    return null;
  }
}
