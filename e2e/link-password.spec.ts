import { expect, test, type APIRequestContext } from "@playwright/test";
import { SHORT } from "../playwright.config";
import { apiAs, createUser } from "./helpers";
import { createLink, ensureDomain, uniq } from "./links-helpers";

async function protectedLink(request: APIRequestContext, playwright: Parameters<typeof apiAs>[0], password = "open-sesame") {
  const admin = await createUser(request, { role: "admin" });
  const api = await apiAs(playwright, admin);
  const domain = await ensureDomain(api);
  const slug = uniq("pwl");
  const link = await createLink(api, { url: "https://example.com/secret", slug, password, domainId: domain.id });
  return { api, slug, link };
}

const guess = (request: APIRequestContext, slug: string, password: string, ip: string) =>
  request.post(`${SHORT}/${slug}`, { form: { password }, maxRedirects: 0, headers: { "x-test-ip": ip } });

test("after five wrong passwords a visitor is told to wait, even with the right one", async ({ request, playwright }) => {
  const { api, slug } = await protectedLink(request, playwright);
  for (let i = 0; i < 5; i++) {
    const res = await guess(request, slug, `wrong-${i}`, "198.51.100.50");
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain("not correct");
  }
  const blocked = await guess(request, slug, "open-sesame", "198.51.100.50");
  expect(blocked.status()).toBe(429);
  expect(await blocked.text()).toContain("Too many attempts");
  expect(blocked.headers()["retry-after"]).toBeTruthy();

  // Someone else is not affected, and gets in with the right password.
  const other = await guess(request, slug, "open-sesame", "198.51.100.51");
  expect(other.status()).toBe(303);
  await api.dispose();
});

test("changing the link password signs out everyone who had unlocked it", async ({ request, playwright }) => {
  const { api, slug, link } = await protectedLink(request, playwright);
  const visitor = await playwright.request.newContext();
  const unlock = await visitor.post(`${SHORT}/${slug}`, { form: { password: "open-sesame" }, maxRedirects: 0, headers: { "x-test-ip": "198.51.100.60" } });
  expect(unlock.status()).toBe(303);
  expect((await visitor.get(`${SHORT}/${slug}`, { maxRedirects: 0 })).status()).toBe(302);

  const changed = await api.patch(`/api/links/${link.id}`, { data: { password: "a-new-password" } });
  expect(changed.ok(), await changed.text()).toBeTruthy();
  const after = await visitor.get(`${SHORT}/${slug}`, { maxRedirects: 0 });
  expect(after.status()).toBe(200);
  expect(await after.text()).toContain('type="password"');
  await Promise.all([visitor.dispose(), api.dispose()]);
});
