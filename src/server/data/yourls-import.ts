import { isbot } from "isbot";
import { z } from "zod";
import { visitorHash } from "../redirect/clicks";
import { classifyUserAgent, isHttpUrl, isPreviewCrawler } from "../redirect/destination";
import { SLUG_PATTERN } from "../links/slug";

/** Request shapes and row mapping of the YOURLS import (the browser reads the dump and sends it in chunks). */

export const MAX_IMPORT_ROWS = 500;

export const importLinkSchema = z.object({
  keyword: z.string().min(1).max(200),
  url: z.string().max(4096),
  title: z.string().nullable().optional(),
  /** Creation time in epoch milliseconds, already converted from the dump's time zone. */
  createdAt: z.number().nullable().optional(),
  clicks: z.number().int().min(0).default(0),
});

export const linksBody = z.object({
  domainId: z.string().min(1),
  ownerId: z.string().min(1),
  redirectType: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]).default(302),
  onConflict: z.enum(["skip", "overwrite"]).default("skip"),
  links: z.array(importLinkSchema).max(MAX_IMPORT_ROWS),
});

export const importClickSchema = z.object({
  id: z.number().int(),
  ts: z.number().nullable(),
  shortUrl: z.string(),
  referrer: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  ip: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
});
export type ImportClick = z.infer<typeof importClickSchema>;

export const clicksBody = z.object({
  domainId: z.string().min(1),
  rows: z.array(importClickSchema).max(MAX_IMPORT_ROWS),
});

export type LinkProblem = "invalid_slug" | "invalid_url";

export function checkImportLink(l: { keyword: string; url: string }): LinkProblem | null {
  if (!SLUG_PATTERN.test(l.keyword)) return "invalid_slug";
  if (!isHttpUrl(l.url)) return "invalid_url";
  return null;
}

export const importKeyFor = (domainId: string, clickId: number) => `yourls:${domainId}:${clickId}`;

/** YOURLS writes "direct" when there is no referrer. */
export function cleanReferrer(value: string | null | undefined): { referrer: string | null; referrerHost: string | null } {
  const v = value?.trim();
  if (!v || v.toLowerCase() === "direct") return { referrer: null, referrerHost: null };
  let host: string | null = null;
  try {
    host = new URL(v).host || null;
  } catch {
    /* not a URL: keep the text, no host */
  }
  return { referrer: v, referrerHost: host };
}

export function cleanCountry(value: string | null | undefined): string | null {
  const v = value?.trim().toUpperCase();
  return v && /^[A-Z]{2}$/.test(v) ? v : null;
}

type Derived = { device: string; os: string | null; browser: string | null; bot: boolean };
export type DeriveCaches = { ua: Map<string, Derived>; hash: Map<string, string> };

/** Click columns for one log row. Results are memoised: a dump repeats the same user agents and visitors a lot. */
export async function deriveClick(authSecret: string, row: ImportClick, ts: number, caches: DeriveCaches) {
  const ua = row.userAgent?.trim() || null;
  const key = ua ?? "";
  let d = caches.ua.get(key);
  if (!d) {
    const info = classifyUserAgent(ua);
    d = { device: info.device, os: info.os, browser: info.browser, bot: isPreviewCrawler(ua) || isbot(ua ?? "") };
    caches.ua.set(key, d);
  }
  const hashKey = `${new Date(ts).toISOString().slice(0, 10)}|${row.ip ?? ""}|${key}`;
  let hash = caches.hash.get(hashKey);
  if (!hash) {
    hash = await visitorHash(authSecret, row.ip?.trim() || null, ua, new Date(ts));
    caches.hash.set(hashKey, hash);
  }
  return { ...d, ...cleanReferrer(row.referrer), country: cleanCountry(row.country), visitorHash: hash };
}
