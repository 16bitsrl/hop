import { expect, test } from "@playwright/test";
import { apiAs, createUser } from "./helpers";
import { createLink, ensureDomain, SHORT_HOST, uniq } from "./links-helpers";

test("/healthz checks the database", async ({ request }) => {
  const res = await request.get("/healthz");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true, db: true });
});

test("/metrics needs the bearer token and speaks Prometheus", async ({ request, playwright }) => {
  expect((await request.get("/metrics")).status()).toBe(401);
  expect((await request.get("/metrics", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);

  const admin = await createUser(request, { role: "admin" });
  const api = await apiAs(playwright, admin);
  const domain = await ensureDomain(api);
  await createLink(api, { url: "https://example.com/metrics", slug: uniq("mt"), domainId: domain.id });

  const res = await request.get("/metrics", { headers: { authorization: "Bearer test-metrics-token" } });
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/plain");
  const text = await res.text();
  expect(text).toContain("# TYPE hop_links gauge");
  expect(text).toMatch(/^hop_links [1-9]\d*$/m);
  expect(text).toMatch(/^hop_links_enabled \d+$/m);
  expect(text).toMatch(/^hop_links_broken \d+$/m);
  expect(text).toMatch(/^hop_clicks_total \d+$/m);
  expect(text).toMatch(/^hop_clicks_last_24h \d+$/m);
  expect(text).toMatch(/^hop_users\{role="admin"\} [1-9]\d*$/m);
  expect(text).toMatch(/^hop_users\{role="viewer"\} \d+$/m);
  expect(text).toMatch(/^hop_domains [1-9]\d*$/m);
  expect(text).toMatch(/^hop_build_info\{version="[^"]+"\} 1$/m);
  await api.dispose();
});

test("the links CSV export has one row per link, for admins only", async ({ request, playwright }) => {
  const admin = await createUser(request, { role: "admin" });
  const member = await createUser(request, { role: "member" });
  const api = await apiAs(playwright, admin);
  const domain = await ensureDomain(api);
  const slug = uniq("csv");
  await createLink(api, { url: "https://example.com/a,b?x=1", slug, title: 'Say "hi"', tags: ["alpha"], domainId: domain.id });

  const res = await api.get("/api/data/links.csv");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(res.headers()["content-disposition"]).toContain(".csv");
  const text = await res.text();
  expect(text.split("\r\n")[0]).toContain("domain,slug,short_url,url,title");
  expect(text).toContain(`${SHORT_HOST},${slug},`);
  expect(text).toContain('"https://example.com/a,b?x=1","Say ""hi"""');
  expect(text).toContain("alpha");

  const memberApi = await apiAs(playwright, member);
  expect((await memberApi.get("/api/data/links.csv")).status()).toBe(403);
  await memberApi.dispose();
  await api.dispose();
});
