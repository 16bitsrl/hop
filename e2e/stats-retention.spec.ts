import { expect, test, type APIRequestContext } from "@playwright/test";
import { apiAs, createUser, loginAs } from "./helpers";
import { DAY, seedClicks, seedLink } from "./stats-helpers";

type ClickRow = { id: number; ts: number };
const clickRows = async (request: APIRequestContext, linkId: string) =>
  (await (await request.get(`/api/_test/clicks?linkId=${linkId}`)).json()) as ClickRow[];
const runJobs = async (request: APIRequestContext) => expect((await request.post("/api/_test/run-jobs")).ok()).toBeTruthy();

test.afterEach(async ({ request, playwright }) => {
  // Never leave a retention window behind for the other tests.
  const admin = await createUser(request, { role: "admin" });
  const api = await apiAs(playwright, admin);
  await api.put("/api/stats/settings", { data: { retentionDays: null } });
  await api.dispose();
});

test("by default clicks are kept forever", async ({ request, playwright }) => {
  const admin = await createUser(request, { role: "admin" });
  const api = await apiAs(playwright, admin);
  expect(await (await api.get("/api/stats/settings")).json()).toEqual({ retentionDays: null });
  const link = await seedLink(request, { clickCount: 5 });
  await seedClicks(request, link.id, [{ ts: Date.now() - 3000 * DAY }, { ts: Date.now() }]);
  await runJobs(request);
  expect(await clickRows(request, link.id)).toHaveLength(2);
  await api.dispose();
});

test("the retention job deletes only clicks older than the window and keeps the lifetime counter", async ({ request, playwright }) => {
  const admin = await createUser(request, { role: "admin" });
  const api = await apiAs(playwright, admin);
  expect((await api.put("/api/stats/settings", { data: { retentionDays: 30 } })).ok()).toBeTruthy();
  const link = await seedLink(request, { clickCount: 4 });
  const other = await seedLink(request, { clickCount: 1 });
  await seedClicks(request, link.id, [
    { ts: Date.now() - 90 * DAY, count: 2 },
    { ts: Date.now() - 31 * DAY },
    { ts: Date.now() - 29 * DAY },
    { ts: Date.now() - DAY },
  ]);
  await seedClicks(request, other.id, [{ ts: Date.now() - 400 * DAY }]);
  await runJobs(request);

  const left = await clickRows(request, link.id);
  expect(left).toHaveLength(2);
  expect(left.every((c) => new Date(c.ts).getTime() > Date.now() - 30 * DAY)).toBe(true);
  expect(await clickRows(request, other.id)).toHaveLength(0);
  const row = await (await request.get(`/api/_test/link/${link.id}`)).json();
  expect(row.clickCount).toBe(4);
  await api.dispose();
});

test("only admins can read or change the retention setting; values are validated", async ({ request, playwright }) => {
  const member = await createUser(request, { role: "member" });
  const memberApi = await apiAs(playwright, member);
  expect((await memberApi.get("/api/stats/settings")).status()).toBe(403);
  expect((await memberApi.put("/api/stats/settings", { data: { retentionDays: 10 } })).status()).toBe(403);
  await memberApi.dispose();

  const admin = await createUser(request, { role: "admin" });
  const api = await apiAs(playwright, admin);
  for (const bad of [0, -3, 1.5, "abc", 100000]) {
    expect((await api.put("/api/stats/settings", { data: { retentionDays: bad } })).status()).toBe(400);
  }
  expect((await api.put("/api/stats/settings", { data: { retentionDays: 90 } })).ok()).toBeTruthy();
  expect(await (await api.get("/api/stats/settings")).json()).toEqual({ retentionDays: 90 });
  await api.dispose();
});

test("the settings page has a Statistics card for the retention window", async ({ page, request }) => {
  const admin = await createUser(request, { role: "admin" });
  await loginAs(page, admin, "/settings");
  await page.getByRole("tab", { name: "Statistics" }).click();
  const field = page.getByLabel("Keep click history for");
  await expect(field).toHaveValue("");
  await field.fill("120");
  await page.getByRole("button", { name: "Save statistics settings" }).click();
  await expect(page.getByText("Saved")).toBeVisible();

  await page.reload();
  await page.getByRole("tab", { name: "Statistics" }).click();
  await expect(page.getByLabel("Keep click history for")).toHaveValue("120");
  await page.getByLabel("Keep click history for").fill("");
  await page.getByRole("button", { name: "Save statistics settings" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
});
