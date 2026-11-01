import { expect, test, type APIRequestContext } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { apiAs, createUser, loginAs } from "./helpers";
import { createLink, ensureDomain } from "./links-helpers";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/yourls-sample.sql");

type ClickRow = {
  id: number;
  ts: number;
  referrer: string | null;
  referrerHost: string | null;
  country: string | null;
  device: string | null;
  os: string | null;
  browser: string | null;
  bot: boolean;
  visitorHash: string | null;
  source: string;
};

async function findLink(api: APIRequestContext, slug: string, domainId: string) {
  const res = await api.get(`/api/links?q=${slug}&domain=${domainId}&pageSize=50`);
  const items = ((await res.json()) as { items: Record<string, any>[] }).items; // eslint-disable-line @typescript-eslint/no-explicit-any
  return items.find((l) => l.slug === slug);
}

const clicksOf = async (request: APIRequestContext, linkId: string) =>
  (await (await request.get(`/api/_test/clicks?linkId=${linkId}`)).json()) as ClickRow[];

test("imports a YOURLS dump with the wizard, keeps conflicts safe and never duplicates clicks", async ({ page, request, playwright }) => {
  const admin = await createUser(request, { role: "admin" });
  const owner = await createUser(request, { role: "member", name: "Imported Owner" });
  const api = await apiAs(playwright, admin);
  const domain = await ensureDomain(api);
  // A link that already uses one of the slugs of the dump.
  const mine = await createLink(api, { url: "https://example.com/mine", slug: "yl-emoji", domainId: domain.id });

  await loginAs(page, admin, "/settings");
  await page.getByRole("tab", { name: "Data" }).click();
  await page.getByLabel("YOURLS backup file").setInputFiles(FIXTURE);

  // Summary
  await expect(page.getByTestId("import-links")).toHaveText("7");
  await expect(page.getByTestId("import-clicks")).toHaveText("12");
  await expect(page.getByTestId("import-orphans")).toHaveText("2");
  await expect(page.getByText("yourls_", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // Options
  await page.getByLabel("Short domain").selectOption(domain.id);
  await page.getByLabel("Owner of imported links").selectOption(owner.id);
  await expect(page.getByLabel("Redirect type")).toHaveValue("302");
  await expect(page.getByLabel("Time zone of the dates")).toHaveValue("UTC");
  await expect(page.getByTestId("import-conflicts")).toContainText("1");
  await expect(page.getByLabel("Skip existing links")).toBeChecked();
  await page.getByRole("button", { name: "Start import" }).click();

  // Report: 7 links in the file, one skipped because the slug is taken; its clicks are not attached to the other link.
  await expect(page.getByTestId("report-created")).toHaveText("6", { timeout: 60_000 });
  await expect(page.getByTestId("report-skipped")).toHaveText("1");
  await expect(page.getByTestId("report-clicks")).toHaveText("7");
  await expect(page.getByTestId("report-orphans")).toHaveText("2");

  const home = await findLink(api, "yl-home", domain.id);
  expect(home).toMatchObject({
    url: "https://example.com/it's-home",
    title: 'L\'azienda, "Home" (2021)',
    clickCount: 5,
    redirectType: 302,
    ownerId: owner.id,
    enabled: true,
  });
  expect(new Date(home!.createdAt).getTime()).toBe(Date.UTC(2020, 2, 15, 10, 30, 0));
  expect(new Date(home!.lastClickedAt).getTime()).toBe(Date.UTC(2021, 6, 1, 12, 0, 0));
  // The existing link was left alone.
  expect(await findLink(api, "yl-emoji", domain.id)).toMatchObject({ id: mine.id, url: "https://example.com/mine", clickCount: 0 });

  const back = await findLink(api, "yl-back", domain.id);
  expect(back!.title).toBe("C:\\dir\\file\nsecond line");
  expect((await findLink(api, "yl-multi", domain.id))!.title).toBe("a,b);(c'd");
  expect((await findLink(api, "yl-multi", domain.id))!.clickCount).toBe(10); // lifetime counter, not the log length
  expect((await findLink(api, "yl-Upper-1", domain.id))!.title).toBeNull();
  expect(await findLink(api, "yl-ghost", domain.id)).toBeUndefined();

  const clicks = await clicksOf(request, home!.id);
  expect(clicks).toHaveLength(5);
  expect(clicks.every((c) => c.source === "import")).toBe(true);
  expect(clicks[0]).toMatchObject({ referrer: null, referrerHost: null, country: "IT", device: "desktop", browser: "Chrome", bot: false });
  expect(new Date(clicks[0]!.ts).getTime()).toBe(Date.UTC(2020, 2, 15, 10, 35, 0));
  expect(clicks[1]).toMatchObject({ referrer: "https://t.co/abc", referrerHost: "t.co", device: "mobile", os: "iOS" });
  expect(clicks[2]).toMatchObject({ bot: true, country: "US", referrerHost: "www.google.com" });
  expect(clicks[2]!.referrer).toContain("it's+home");
  expect(clicks[4]!.country).toBeNull();
  for (const c of clicks) expect(c.visitorHash).toMatch(/^[0-9a-f]{16}$/);
  expect(JSON.stringify(clicks)).not.toContain("203.0.113");

  // Second run: replace existing links. Nothing is duplicated, the conflicting link is now overwritten.
  await page.getByRole("button", { name: "Import another file" }).click();
  await page.getByLabel("YOURLS backup file").setInputFiles(FIXTURE);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Short domain").selectOption(domain.id);
  await page.getByLabel("Owner of imported links").selectOption(owner.id);
  await expect(page.getByTestId("import-conflicts")).toContainText("7");
  await page.getByLabel("Replace existing links").check();
  await page.getByRole("button", { name: "Start import" }).click();
  await expect(page.getByTestId("report-updated")).toHaveText("7", { timeout: 60_000 });
  await expect(page.getByTestId("report-created")).toHaveText("0");
  await expect(page.getByTestId("report-clicks")).toHaveText("3"); // only the clicks of the link that had been skipped
  await expect(page.getByTestId("report-duplicates")).toHaveText("7");

  expect(await clicksOf(request, home!.id)).toHaveLength(5);
  const emoji = await findLink(api, "yl-emoji", domain.id);
  expect(emoji).toMatchObject({ id: mine.id, url: "https://example.com/caff%C3%A8?q=%E2%98%95", title: "Caffè ☕ 🚀", clickCount: 3 });
  expect(await clicksOf(request, emoji!.id)).toHaveLength(3);

  await api.dispose();
});

test("import endpoints are for admins only", async ({ request, playwright }) => {
  const member = await createUser(request, { role: "member" });
  const api = await apiAs(playwright, member);
  expect((await api.post("/api/data/yourls/links", { data: {} })).status()).toBe(403);
  expect((await api.post("/api/data/yourls/clicks", { data: {} })).status()).toBe(403);
  expect((await api.get("/api/data/backup")).status()).toBe(403);
  expect((await request.post("/api/data/yourls/links", { data: {} })).status()).toBe(401);
  await api.dispose();
});
