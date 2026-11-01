import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { domains, links } from "../db/schema";
import type { AppEnv } from "../env";
import { verifyLinkPassword } from "../lib/password";
import { recordClick } from "./clicks";
import {
  classifyUserAgent,
  isHttpUrl,
  isPreviewCrawler,
  mergeQuery,
  parseLanguage,
  selectDestination,
} from "./destination";
import {
  deepLinkPage,
  expiredPage,
  landingPage,
  notFoundPage,
  passwordPage,
  pickLang,
  previewPage,
} from "./pages";
import { createUnlockCookie, hasValidUnlock } from "./unlock";

const REDIRECT_HEADERS = {
  // Not cacheable even for 301/308, otherwise browsers would skip us and stats would break.
  "cache-control": "private, max-age=0",
  "referrer-policy": "strict-origin-when-cross-origin",
};

function redirect(url: string, status: number): Response {
  return new Response(null, { status, headers: { location: new URL(url).href, ...REDIRECT_HEADERS } });
}

/** Schemes that must never be opened from an app link. */
function isSafeAppUrl(value: string | null): value is string {
  if (!value) return false;
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(value);
  return !!m && !/^(javascript|data|vbscript|file|blob)$/i.test(m[1]!) && !/[\s<>"]/.test(value);
}

/** Entry point for every request on a short domain. */
export async function handleShortDomain(c: Context<AppEnv>): Promise<Response> {
  const platform = c.var.platform;
  const req = c.req.raw;
  const url = new URL(req.url);
  const lang = pickLang(req.headers.get("accept-language"));

  const hostname = url.hostname.toLowerCase();
  let slug: string;
  try {
    slug = decodeURIComponent(url.pathname.slice(1));
  } catch {
    slug = url.pathname.slice(1);
  }
  if (slug.endsWith("/")) slug = slug.slice(0, -1);

  const [row] = await platform.db
    .select({ domain: domains, link: links })
    .from(domains)
    .leftJoin(links, and(eq(links.domainId, domains.id), eq(links.slug, slug)))
    .where(eq(domains.host, hostname))
    .limit(1);

  if (!row) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  const { domain, link } = row;

  const notFound = () =>
    isHttpUrl(domain.notFoundUrl) ? redirect(domain.notFoundUrl, 302) : notFoundPage(lang);

  if (slug === "") {
    return isHttpUrl(domain.rootUrl) ? redirect(domain.rootUrl, 302) : landingPage(lang);
  }
  if (!link) return notFound();

  const fallbackOr = (page: () => Response) => (isHttpUrl(link.fallbackUrl) ? redirect(link.fallbackUrl, 302) : page());

  if (!link.enabled) return fallbackOr(notFound);
  if (
    (link.expiresAt && link.expiresAt.getTime() <= Date.now()) ||
    (link.maxClicks != null && link.clickCount >= link.maxClicks)
  ) {
    return fallbackOr(() => expiredPage(lang));
  }

  const secret = platform.config.authSecret;
  if (link.passwordHash && !(await hasValidUnlock(secret, req.headers.get("cookie"), link.id, domain.id))) {
    if (req.method !== "POST") return passwordPage(lang, false);
    let password = "";
    try {
      const form = await req.formData();
      password = String(form.get("password") ?? "");
    } catch {
      /* treated as wrong password */
    }
    if (!(await verifyLinkPassword(password, link.passwordHash))) return passwordPage(lang, true);
    const cookie = await createUnlockCookie(secret, link.id, domain.id, url.protocol === "https:");
    return new Response(null, {
      status: 303,
      headers: { location: url.pathname + url.search, "set-cookie": cookie, "cache-control": "no-store" },
    });
  }

  const ua = req.headers.get("user-agent");
  const uaInfo = classifyUserAgent(ua);
  const dest = selectDestination(link, {
    ua: uaInfo,
    country: platform.geo(req).country?.toUpperCase() ?? null,
    language: parseLanguage(req.headers.get("accept-language")),
  });
  if (!isHttpUrl(dest.url)) return notFound();
  const target = link.forwardQuery ? mergeQuery(dest.url, url.searchParams) : dest.url;

  const log = () => {
    if (req.method === "GET") platform.waitUntil(recordClick(platform, req, link.id, dest.target));
  };

  if (isPreviewCrawler(ua) && (link.ogTitle || link.ogDescription || link.ogImage)) {
    log();
    return previewPage(lang, {
      title: link.ogTitle,
      description: link.ogDescription,
      image: link.ogImage,
      url: new URL(target).href,
    });
  }

  if (isSafeAppUrl(dest.appUrl) && (uaInfo.isIos || uaInfo.isAndroid)) {
    log();
    return deepLinkPage(lang, dest.appUrl, new URL(target).href);
  }

  log();
  return redirect(target, link.redirectType);
}
