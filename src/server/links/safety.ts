import { inArray } from "drizzle-orm";
import { blockedDomains } from "../db/schema";
import type { DB } from "../platform/types";

/** Destination safety (J6): blocked domains list and Google Safe Browsing v4. */

/** Lowercase host without trailing dot. Accepts a host or a URL. */
export function normalizeHost(input: string): string {
  let value = input.trim().toLowerCase();
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(value)) {
    try {
      value = new URL(value).hostname;
    } catch {
      /* keep as is */
    }
  } else {
    value = value.split(/[/?#]/)[0] ?? value;
    value = value.replace(/:\d+$/, "");
  }
  return value.replace(/^\.+/, "").replace(/\.+$/, "");
}

/** A plausible host name (letters, digits, dots, hyphens) with at least one character. */
export const isValidBlockedHost = (host: string): boolean => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(host);

/** True when `host` is one of the blocked hosts or a subdomain of one. */
export function isHostBlocked(host: string, blocked: Iterable<string>): boolean {
  const h = normalizeHost(host);
  const set = new Set(blocked);
  const parts = h.split(".");
  for (let i = 0; i < parts.length; i++) {
    if (set.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

/** Every candidate "host or parent domain" for a host, longest first. */
export function hostAndParents(host: string): string[] {
  const parts = normalizeHost(host).split(".");
  return parts.map((_, i) => parts.slice(i).join(".")).filter(Boolean);
}

export type SafeBrowsingResult = { unsafe: string[]; error?: boolean };

const THREAT_TYPES = ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"];

/**
 * Asks Google Safe Browsing (threatMatches:find) about the URLs.
 * Fails open: if the service cannot be reached the links are allowed and `error` is set.
 */
export async function checkSafeBrowsing(
  urls: string[],
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SafeBrowsingResult> {
  const unique = [...new Set(urls)];
  if (unique.length === 0) return { unsafe: [] };
  try {
    const res = await fetchImpl(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client: { clientId: "hop", clientVersion: "1.0" },
        threatInfo: {
          threatTypes: THREAT_TYPES,
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: unique.map((url) => ({ url })),
        },
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { unsafe: [], error: true };
    const data = (await res.json()) as { matches?: { threat?: { url?: string } }[] };
    const hits = (data.matches ?? []).map((m) => m.threat?.url).filter((u): u is string => !!u);
    return { unsafe: [...new Set(hits)] };
  } catch {
    return { unsafe: [], error: true };
  }
}

export type SafetyVerdict = { ok: true } | { ok: false; error: "destination_blocked" | "destination_unsafe"; url: string };

/** Checks every URL against the blocked list, then Safe Browsing when a key is configured. */
export async function checkDestinations(
  db: DB,
  urls: string[],
  safeBrowsingKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<SafetyVerdict> {
  const unique = [...new Set(urls.filter(Boolean))];
  if (unique.length === 0) return { ok: true };

  const hosts = new Map<string, string>(); // url -> host
  for (const url of unique) {
    try {
      hosts.set(url, new URL(url).hostname);
    } catch {
      /* invalid URLs are rejected by validation before this point */
    }
  }
  const candidates = [...new Set([...hosts.values()].flatMap(hostAndParents))];
  if (candidates.length > 0) {
    // Stay well under the database limit on bound values per query.
    const blocked = new Set<string>();
    for (let i = 0; i < candidates.length; i += 50) {
      const rows = await db.select({ host: blockedDomains.host }).from(blockedDomains).where(inArray(blockedDomains.host, candidates.slice(i, i + 50)));
      for (const r of rows) blocked.add(r.host);
    }
    for (const [url, host] of hosts) {
      if (isHostBlocked(host, blocked)) return { ok: false, error: "destination_blocked", url };
    }
  }

  if (safeBrowsingKey) {
    const { unsafe } = await checkSafeBrowsing(unique, safeBrowsingKey, fetchImpl);
    if (unsafe.length > 0) return { ok: false, error: "destination_unsafe", url: unsafe[0]! };
  }
  return { ok: true };
}
