import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { domains, links } from "../db/schema";
import type { AppEnv } from "../env";
import { verifyLinkPassword } from "../lib/password";
import { publicStatsUrl } from "../stats/public";
import { limiterIp } from "../auth/client-ip";
import { clearPasswordAttempts, ipDigest, takePasswordAttempt } from "./attempts";
import { consumeVisit, isBotUa, recordClick } from "./clicks";
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
import { qrPng, qrSvg } from "./qr";
import { createUnlockCookie, hasValidUnlock } from "./unlock";

async function linkExists(db: AppEnv["Variables"]["platform"]["db"], domainId: string, slug: string): Promise<boolean> {
  const [row] = await db.select({ id: links.id }).from(links).where(and(eq(links.domainId, domainId), eq(links.slug, slug))).limit(1);
  return !!row;
}

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
    return isHttpUrl(domain.rootUrl) ? redirect(domain.rootUrl, 302) : landingPage(lang, url.host);
  }
  if (!link) {
    // YOURLS conventions: "<slug>+" opens the link's statistics, "<slug>.qr" / "<slug>.qrv" its QR code.
    const stats = slug.length > 1 && slug.endsWith("+") ? await publicStatsUrl(platform, domain.id, slug.slice(0, -1)) : null;
    if (stats) return redirect(stats, 302);
    const qr = /^(.+)\.qr(v?)$/.exec(slug);
    if (qr && (await linkExists(platform.db, domain.id, qr[1]!))) {
      const target = `${url.protocol}//${url.host}/${qr[1]}`;
      const headers = { "cache-control": "public, max-age=3600", "x-content-type-options": "nosniff" };
      return qr[2]
        ? new Response(qrSvg(target), { headers: { "content-type": "image/svg+xml; charset=utf-8", ...headers } })
        : new Response(await qrPng(target), { headers: { "content-type": "image/png", ...headers } });
    }
    return notFound();
  }

  const fallbackOr = (page: () => Response) => (isHttpUrl(link.fallbackUrl) ? redirect(link.fallbackUrl, 302) : page());

  if (!link.enabled) return fallbackOr(notFound);
  if (
    (link.expiresAt && link.expiresAt.getTime() <= Date.now()) ||
    (link.maxClicks != null && link.clickCount >= link.maxClicks)
  ) {
    return fallbackOr(() => expiredPage(lang));
  }

  const secret = platform.config.authSecret;
  if (link.passwordHash && !(await hasValidUnlock(secret, req.headers.get("cookie"), link.id, domain.id, link.passwordHash))) {
    if (req.method !== "POST") return passwordPage(lang, false);
    // Each guess costs a slow hash, so the number of guesses is capped before any hashing happens.
    const ipHash = await ipDigest(secret, limiterIp(platform, req));
    const { blockedFor } = await takePasswordAttempt(platform.db, link.id, ipHash);
    if (blockedFor !== null) return passwordPage(lang, "locked", blockedFor);
    let password = "";
    try {
      const form = await req.formData();
      password = String(form.get("password") ?? "");
    } catch {
      /* treated as wrong password */
    }
    if (!(await verifyLinkPassword(password, link.passwordHash))) return passwordPage(lang, true);
    await clearPasswordAttempts(platform.db, link.id, ipHash);
    const cookie = await createUnlockCookie(secret, link.id, domain.id, url.protocol === "https:", link.passwordHash);
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

  // A link with a click limit gives out its visits one at a time, before redirecting, so parallel
  // requests cannot all get through. Bots and preview crawlers never use a visit.
  let counted = false;
  if (link.maxClicks != null && req.method === "GET" && !isBotUa(ua)) {
    if (!(await consumeVisit(platform.db, link.id))) return fallbackOr(() => expiredPage(lang));
    counted = true;
  }

  const log = () => {
    if (req.method === "GET") platform.waitUntil(recordClick(platform, req, link.id, dest.target, counted));
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
