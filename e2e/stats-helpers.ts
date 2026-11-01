import { expect, type APIRequestContext } from "@playwright/test";

/** Statistics test helpers: seed links and synthetic clicks, call the stats API. */

export const HOST = "stats.localhost";

let n = 0;
export const uniq = (p: string) => `${p}-${Date.now().toString(36)}${n++}`;

export async function seedLink(request: APIRequestContext, link: Record<string, unknown> = {}) {
  const res = await request.post("/api/_test/links", {
    data: { host: HOST, slug: uniq("st"), url: "https://example.com/stats", ...link },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as { id: string; slug: string; domainId: string };
}

export type SeedClick = {
  ts: number;
  /** Insert this many identical rows (default 1). */
  count?: number;
  visitorHash?: string | null;
  bot?: boolean;
  referrerHost?: string | null;
  country?: string | null;
  city?: string | null;
  device?: string | null;
  os?: string | null;
  browser?: string | null;
  language?: string | null;
  target?: string | null;
  linkId?: string;
};

export async function seedClicks(request: APIRequestContext, linkId: string, clicks: SeedClick[]) {
  const res = await request.post("/api/_test/clicks", { data: { linkId, clicks } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as { inserted: number };
}

export const DAY = 86_400_000;
export const HOUR = 3_600_000;

export type Row = { key: string | null; clicks: number; country?: string | null };
export type Summary = {
  range: { from: number; to: number; tz: string; bucket: "hour" | "day" | "month" };
  link: { id: string; slug: string; host: string; title: string | null } | null;
  totals: { clicks: number; visitors: number; bots: number };
  series: { key: string; clicks: number }[];
  referrers: Row[];
  countries: Row[];
  cities: Row[];
  devices: Row[];
  os: Row[];
  browsers: Row[];
  languages: Row[];
  targets: { target: string; url: string | null; clicks: number; visitors: number }[];
};

export async function summary(api: APIRequestContext, params: Record<string, string | number>) {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await api.get(`/api/stats/summary?${qs}`);
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as Summary;
}
