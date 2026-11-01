import { expect, type APIRequestContext } from "@playwright/test";

export const SHORT_HOST = "s.localhost";
export const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
export const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

let n = 0;
export const uniq = (p: string) => `${p}${Date.now().toString(36)}${n++}`;

export type DomainJson = { id: string; host: string; isDefault: boolean };

/** Finds the domain by host or creates it (needs an admin client). */
export async function ensureDomain(admin: APIRequestContext, host = SHORT_HOST, extra: Record<string, unknown> = {}) {
  const list = (await (await admin.get("/api/domains")).json()) as { domains: DomainJson[] };
  const found = list.domains.find((d) => d.host === host);
  if (found) return found;
  const res = await admin.post("/api/domains", { data: { host, ...extra } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return ((await res.json()) as { domain: DomainJson }).domain;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LinkJson = Record<string, any>;

export async function createLink(api: APIRequestContext, body: Record<string, unknown>): Promise<LinkJson> {
  const res = await api.post("/api/links", { data: { fetchMeta: false, ...body } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return ((await res.json()) as { link: LinkJson }).link;
}
