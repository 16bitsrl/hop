import { UAParser } from "ua-parser-js";
import type { LinkRule, LinkVariant } from "../db/schema";

export type DeviceKind = "desktop" | "mobile" | "tablet" | "other";

export interface UaInfo {
  device: DeviceKind;
  os: string | null;
  browser: string | null;
  isIos: boolean;
  isAndroid: boolean;
}

export function classifyUserAgent(ua: string | null | undefined): UaInfo {
  const r = new UAParser(ua ?? "").getResult();
  const os = r.os.name ?? null;
  const isIos = os === "iOS";
  const isAndroid = os === "Android";
  const type = r.device.type;
  let device: DeviceKind = "desktop";
  if (type === "mobile") device = "mobile";
  else if (type === "tablet") device = "tablet";
  else if (type) device = "other";
  else if (isAndroid) device = /mobile/i.test(ua ?? "") ? "mobile" : "tablet";
  return { device, os, browser: r.browser.name ?? null, isIos, isAndroid };
}

const CRAWLERS =
  /facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|slack-imgproxy|whatsapp|telegrambot|discordbot|pinterest|applebot|skypeuripreview|redditbot|embedly|vkshare|tumblr|line-poker|mastodon|bluesky|iframely/i;

/** Link-preview crawlers that should get Open Graph markup. */
export function isPreviewCrawler(ua: string | null | undefined): boolean {
  return !!ua && CRAWLERS.test(ua);
}

/** Primary subtag (lowercase) of the highest-priority Accept-Language entry. */
export function parseLanguage(header: string | null | undefined): string | null {
  if (!header) return null;
  let best: { tag: string; q: number } | null = null;
  for (const part of header.split(",")) {
    const [tagRaw, ...params] = part.trim().split(";");
    const tag = tagRaw?.trim().toLowerCase();
    if (!tag || tag === "*") continue;
    let q = 1;
    for (const p of params) {
      const m = /^\s*q\s*=\s*([\d.]+)\s*$/.exec(p);
      if (m) q = Number(m[1]);
    }
    if (!Number.isFinite(q) || q <= 0) continue;
    if (!best || q > best.q) best = { tag, q };
  }
  return best ? (best.tag.split("-")[0] ?? null) : null;
}

/** Index of a weighted-random variant. `random` returns [0, 1). */
export function pickVariant(variants: LinkVariant[], random: () => number = Math.random): number {
  const weights = variants.map((v) => (v.weight > 0 ? v.weight : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let r = random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!;
    if (r < 0) return i;
  }
  return weights.findLastIndex((w) => w > 0);
}

/** Merges incoming query params into `url`; incoming params override same-name ones. */
export function mergeQuery(url: string, incoming: URLSearchParams): string {
  if ([...incoming.keys()].length === 0) return url;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  for (const key of new Set(incoming.keys())) u.searchParams.delete(key);
  for (const [k, v] of incoming) u.searchParams.append(k, v);
  return u.toString();
}

export interface RequestInfo {
  ua: UaInfo;
  country: string | null;
  language: string | null;
}

export interface Destination {
  url: string;
  appUrl: string | null;
  /** "main" | "rule:<i>" | "variant:<i>" */
  target: string;
}

type DestinationLink = {
  url: string;
  appUrl: string | null;
  rules: LinkRule[];
  variants: LinkVariant[];
};

function ruleMatches(rule: LinkRule, req: RequestInfo): boolean {
  if (rule.devices?.length) {
    const ok = rule.devices.some((d) => {
      if (d === "ios") return req.ua.isIos;
      if (d === "android") return req.ua.isAndroid;
      return req.ua.device === d;
    });
    if (!ok) return false;
  }
  if (rule.countries?.length) {
    if (!req.country || !rule.countries.some((c) => c.toUpperCase() === req.country)) return false;
  }
  if (rule.languages?.length) {
    if (!req.language || !rule.languages.some((l) => l.toLowerCase() === req.language)) return false;
  }
  return true;
}

export function selectDestination(
  link: DestinationLink,
  req: RequestInfo,
  random: () => number = Math.random,
): Destination {
  const rules = link.rules ?? [];
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]!;
    if (ruleMatches(rule, req)) return { url: rule.url, appUrl: rule.appUrl ?? null, target: `rule:${i}` };
  }
  const variants = link.variants ?? [];
  if (variants.length > 0) {
    const i = pickVariant(variants, random);
    return { url: variants[i]!.url, appUrl: null, target: `variant:${i}` };
  }
  return { url: link.url, appUrl: link.appUrl ?? null, target: "main" };
}

/** True for absolute http(s) URLs. */
export function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const p = new URL(value).protocol;
    return p === "http:" || p === "https:";
  } catch {
    return false;
  }
}
