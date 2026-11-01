import { eq, sql } from "drizzle-orm";
import { isbot } from "isbot";
import { clicks, links } from "../db/schema";
import type { Platform } from "../platform/types";
import { classifyUserAgent, isPreviewCrawler, parseLanguage } from "./destination";

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

/** First 16 hex chars of sha256(daily salt + ip + ua). The IP itself is never stored. */
export async function visitorHash(authSecret: string, ip: string | null, ua: string | null, now = new Date()) {
  const salt = await hmacHex(authSecret, now.toISOString().slice(0, 10));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}${ip ?? ""}${ua ?? ""}`));
  return hex(digest).slice(0, 16);
}

/** Records a click and bumps the link counters. Never throws. */
export async function recordClick(platform: Platform, req: Request, linkId: string, target: string): Promise<void> {
  try {
    const ua = req.headers.get("user-agent");
    const info = classifyUserAgent(ua);
    const geo = platform.geo(req);
    const referrer = req.headers.get("referer");
    let referrerHost: string | null = null;
    if (referrer) {
      try {
        referrerHost = new URL(referrer).host || null;
      } catch {
        /* ignore malformed referrer */
      }
    }
    const now = new Date();
    await platform.db.insert(clicks).values({
      linkId,
      ts: now,
      referrer,
      referrerHost,
      country: geo.country ?? null,
      region: geo.region ?? null,
      city: geo.city ?? null,
      device: info.device,
      os: info.os,
      browser: info.browser,
      language: parseLanguage(req.headers.get("accept-language")),
      bot: isPreviewCrawler(ua) || isbot(ua ?? ""),
      visitorHash: await visitorHash(platform.config.authSecret, platform.clientIp(req), ua, now),
      target,
      source: "live",
    });
    await platform.db
      .update(links)
      .set({ clickCount: sql`${links.clickCount} + 1`, lastClickedAt: now })
      .where(eq(links.id, linkId));
  } catch (err) {
    console.error("click logging failed", err);
  }
}
