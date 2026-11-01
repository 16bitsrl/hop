import { expect, test, type APIRequestContext } from "@playwright/test";
import { apiAs, createUser, loginAs } from "./helpers";
import { createLink, ensureDomain, uniq } from "./links-helpers";
import { APP } from "../playwright.config";

const status = (code: number) => `${APP}/api/_test/status/${code}`;
const runJobs = async (request: APIRequestContext) => expect((await request.post("/api/_test/run-jobs")).ok()).toBeTruthy();
const getLink = async (api: APIRequestContext, id: string) => ((await (await api.get(`/api/links/${id}`)).json()) as { link: Record<string, any> }).link; // eslint-disable-line @typescript-eslint/no-explicit-any

test.afterEach(async ({ request, playwright }) => {
  const admin = await createUser(request, { role: "admin" });
  const api = await apiAs(playwright, admin);
  await api.put("/api/links-health/settings", { data: { enabled: true, recheckDays: 7 } });
  await api.dispose();
});

test("a link is marked broken only after two failed checks in a row, and recovers", async ({ request, playwright }) => {
  const admin = await createUser(request, { role: "admin" });
  const api = await apiAs(playwright, admin);
  const domain = await ensureDomain(api, "health.localhost");
  const good = await createLink(api, { url: status(200), slug: uniq("ok"), domainId: domain.id });
  const gone = await createLink(api, { url: status(404), slug: uniq("gone"), domainId: domain.id });
  const down = await createLink(api, { url: status(503), slug: uniq("down"), domainId: domain.id });
  const noHead = await createLink(api, { url: `${APP}/api/_test/status-no-head/200`, slug: uniq("nohead"), domainId: domain.id });
  const unauthorized = await createLink(api, { url: status(403), slug: uniq("forbidden"), domainId: domain.id });

  await runJobs(request);
  expect(await getLink(api, good.id)).toMatchObject({ healthStatus: "ok", healthCode: 200 });
  expect(await getLink(api, noHead.id)).toMatchObject({ healthStatus: "ok", healthCode: 200 });
  expect(await getLink(api, unauthorized.id)).toMatchObject({ healthStatus: "ok", healthCode: 403 });
  // First failure: remembered, not yet broken.
  expect(await getLink(api, gone.id)).toMatchObject({ healthStatus: "unknown", healthCode: 404 });
  expect(await getLink(api, down.id)).toMatchObject({ healthStatus: "unknown", healthCode: 503 });

  await runJobs(request);
  expect(await getLink(api, gone.id)).toMatchObject({ healthStatus: "broken", healthCode: 404 });
  expect(await getLink(api, down.id)).toMatchObject({ healthStatus: "broken", healthCode: 503 });
  expect((await getLink(api, gone.id)).states).toContain("broken");
  expect((await getLink(api, gone.id)).healthCheckedAt).toBeTruthy();

  const filtered = (await (await api.get(`/api/links?state=broken&domain=${domain.id}`)).json()) as { items: { id: string }[]; total: number };
  expect(filtered.items.map((l) => l.id).sort()).toEqual([gone.id, down.id].sort());

  // The destination comes back: the next check clears it.
  expect((await api.patch(`/api/links/${gone.id}`, { data: { url: status(200) } })).ok()).toBeTruthy();
  const checked = await api.post(`/api/links/${gone.id}/check`);
  expect(checked.ok()).toBeTruthy();
  expect((await checked.json()).link).toMatchObject({ healthStatus: "ok", healthCode: 200 });
  await api.dispose();
});

test("check now gives a final verdict and is open to members, not viewers", async ({ request, playwright }) => {
  const admin = await createUser(request, { role: "admin" });
  const member = await createUser(request, { role: "member" });
  const viewer = await createUser(request, { role: "viewer" });
  const api = await apiAs(playwright, admin);
  const domain = await ensureDomain(api, "health.localhost");
  const link = await createLink(api, { url: status(410), slug: uniq("now"), domainId: domain.id });

  const memberApi = await apiAs(playwright, member);
  const res = await memberApi.post(`/api/links/${link.id}/check`);
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).link).toMatchObject({ healthStatus: "broken", healthCode: 410 });
  const viewerApi = await apiAs(playwright, viewer);
  expect((await viewerApi.post(`/api/links/${link.id}/check`)).status()).toBe(403);
  expect((await api.post("/api/links/does-not-exist/check")).status()).toBe(404);
  await Promise.all([memberApi.dispose(), viewerApi.dispose(), api.dispose()]);
});

test("the check can be turned off in the settings", async ({ request, playwright }) => {
  const admin = await createUser(request, { role: "admin" });
  const api = await apiAs(playwright, admin);
  const domain = await ensureDomain(api, "health.localhost");
  expect(await (await api.get("/api/links-health/settings")).json()).toEqual({ enabled: true, recheckDays: 7 });
  expect((await api.put("/api/links-health/settings", { data: { enabled: false, recheckDays: 3 } })).ok()).toBeTruthy();
  const link = await createLink(api, { url: status(500), slug: uniq("off"), domainId: domain.id });
  await runJobs(request);
  await runJobs(request);
  expect(await getLink(api, link.id)).toMatchObject({ healthStatus: "unknown", healthCode: null });
  expect((await api.put("/api/links-health/settings", { data: { enabled: true, recheckDays: 0 } })).status()).toBe(400);
  await api.dispose();
});

test("admins set the check options and see broken links on the dashboard and the links list", async ({ page, request, playwright }) => {
  const admin = await createUser(request, { role: "admin" });
  const api = await apiAs(playwright, admin);
  const domain = await ensureDomain(api, "health.localhost");
  const slug = uniq("dash");
  const link = await createLink(api, { url: status(404), slug, title: "Dead page", domainId: domain.id });
  await runJobs(request);
  await runJobs(request);

  await loginAs(page, admin, "/settings");
  await page.getByRole("tab", { name: "Links" }).click();
  const card = page.getByTestId("health-settings");
  await expect(card.getByRole("switch", { name: "Check destinations" })).toBeChecked();
  await card.getByLabel("Check each link every").selectOption("3");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved").first()).toBeVisible();
  expect(await (await api.get("/api/links-health/settings")).json()).toEqual({ enabled: true, recheckDays: 3 });

  await page.goto("/dashboard");
  const broken = page.getByTestId("dash-broken");
  await expect(broken).toContainText("health.localhost/" + slug);
  await broken.getByRole("link", { name: /View all/ }).click();
  await expect(page).toHaveURL(/\/links/);
  await expect(page.getByText(slug).first()).toBeVisible();

  // The link page offers "Check now" and shows the verdict.
  await page.goto(`/links/${link.id}`);
  await expect(page.getByText("Broken").first()).toBeVisible();
  await expect(page.getByTestId("health-code")).toContainText("404");
  await api.patch(`/api/links/${link.id}`, { data: { url: status(200) } });
  await page.getByRole("button", { name: "Check now" }).click();
  await expect(page.getByTestId("health-code")).toContainText("200");
  await api.dispose();
});
