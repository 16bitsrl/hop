import { expect, test } from "@playwright/test";
import { SHORT } from "../playwright.config";
import { createUser, loginAs } from "./helpers";
import { DAY, HOUR, HOST, seedClicks, seedLink, uniq } from "./stats-helpers";

const value = (page: import("@playwright/test").Page, id: string) => page.getByTestId(`kpi-${id}-value`);

test("link statistics: KPIs, range switch, bots toggle, breakdowns", async ({ page, request }) => {
  const user = await createUser(request, { role: "member" });
  const now = Date.now();
  const link = await seedLink(request, { title: "Stats probe", ownerId: user.id });
  await seedClicks(request, link.id, [
    { ts: now - HOUR, visitorHash: "u1", country: "IT", city: "Rome", referrerHost: "news.example.org", device: "mobile", os: "iOS", browser: "Safari", language: "it" },
    { ts: now - 2 * HOUR, visitorHash: "u1", country: "IT", city: "Rome", referrerHost: "news.example.org", device: "mobile", os: "iOS", browser: "Safari", language: "it" },
    { ts: now - 3 * DAY, visitorHash: "u2", country: "DE", device: "desktop", os: "Windows", browser: "Chrome", language: "de" },
    { ts: now - 20 * DAY, visitorHash: "u3", country: "FR" },
    { ts: now - 60 * DAY, count: 2, visitorHash: "u4" },
    { ts: now - HOUR, count: 3, bot: true, visitorHash: "b1" },
  ]);
  await loginAs(page, user, `/stats/${link.id}`);

  await expect(page.getByRole("heading", { name: "Stats probe" })).toBeVisible();
  const range = page.getByRole("group", { name: "Date range" });

  // 7 days is the default.
  await expect(range.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
  await expect(value(page, "clicks")).toHaveText("3");
  await expect(value(page, "visitors")).toHaveText("2");
  await expect(value(page, "bots")).toHaveText("3");

  await range.getByRole("button", { name: "24 hours" }).click();
  await expect(value(page, "clicks")).toHaveText("2");
  await expect(value(page, "visitors")).toHaveText("1");

  await range.getByRole("button", { name: "30 days" }).click();
  await expect(value(page, "clicks")).toHaveText("4");
  await range.getByRole("button", { name: "90 days" }).click();
  await expect(value(page, "clicks")).toHaveText("6");
  await range.getByRole("button", { name: "All time" }).click();
  await expect(value(page, "clicks")).toHaveText("6");

  // Bots toggle.
  await page.getByRole("switch", { name: "Include bots" }).click();
  await expect(value(page, "clicks")).toHaveText("9");

  // Breakdowns.
  await page.getByRole("switch", { name: "Include bots" }).click();
  await expect(page.getByTestId("breakdown-countries")).toContainText("Italy");
  await expect(page.getByTestId("breakdown-countries")).toContainText("Germany");
  await expect(page.getByTestId("breakdown-referrers")).toContainText("news.example.org");
  await expect(page.getByTestId("breakdown-referrers")).toContainText("Direct");
  await expect(page.getByTestId("breakdown-cities")).toContainText("Rome");
  await expect(page.getByTestId("breakdown-devices")).toContainText("Mobile");
  await expect(page.getByTestId("breakdown-os")).toContainText("iOS");
  await expect(page.getByTestId("breakdown-browsers")).toContainText("Safari");
  await expect(page.getByTestId("breakdown-languages")).toContainText("Italian");

  // Custom range.
  await range.getByRole("button", { name: "Custom" }).click();
  const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  await page.getByLabel("From").fill(ymd(now - 4 * DAY));
  await page.getByLabel("To").fill(ymd(now));
  await expect(value(page, "clicks")).toHaveText("3");

  // CSV downloads are plain links.
  await expect(page.getByRole("link", { name: "Export clicks (CSV)" })).toHaveAttribute("href", /\/api\/stats\/export\.csv\?.*kind=clicks/);
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export summary (CSV)" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
});

test("link statistics: A/B test and rules performance, empty state", async ({ page, request }) => {
  const user = await createUser(request, { role: "member" });
  const now = Date.now();
  const link = await seedLink(request, {
    ownerId: user.id,
    url: "https://example.com/main",
    variants: [
      { url: "https://example.com/variant-a", weight: 1 },
      { url: "https://example.com/variant-b", weight: 1 },
    ],
  });
  const quiet = await seedLink(request, { ownerId: user.id });
  await seedClicks(request, link.id, [
    { ts: now - HOUR, count: 4, target: "variant:0" },
    { ts: now - HOUR, count: 1, target: "variant:1" },
  ]);
  await loginAs(page, user, `/stats/${link.id}`);
  const targets = page.getByTestId("breakdown-targets");
  await expect(targets).toContainText("example.com/variant-a");
  await expect(targets).toContainText("Variant A");
  await expect(targets).toContainText("80%");
  await expect(targets).toContainText("Variant B");

  await page.goto(`/stats/${quiet.id}`);
  await expect(page.getByText("No clicks in this period")).toBeVisible();
  await expect(value(page, "clicks")).toHaveText("0");
});

test("time zone: the page asks for statistics in the browser's time zone", async ({ browser, request }) => {
  const user = await createUser(request, { role: "member" });
  const link = await seedLink(request, {});
  await seedClicks(request, link.id, [{ ts: Date.now() - HOUR }]);
  // The page asks the API in its own zone (bucketing itself is covered by the API tests).
  const ctx = await browser.newContext({ timezoneId: "Pacific/Kiritimati" });
  const page = await ctx.newPage();
  const seen: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname === "/api/stats/summary") seen.push(u.searchParams.get("tz") ?? "");
  });
  await loginAs(page, user, `/stats/${link.id}`);
  await expect(page.getByTestId("kpi-clicks-value")).toBeVisible();
  expect(seen[0]).toBe("Pacific/Kiritimati");
  await ctx.close();
});

test("dashboard: range picker changes every number", async ({ page, request }) => {
  const admin = await createUser(request, { role: "admin" });
  const now = Date.now();
  const l = await seedLink(request, { title: "Dash probe", ownerId: admin.id });
  const owned = uniq("Owner");
  const owner = await createUser(request, { role: "member", name: owned });
  const l2 = await seedLink(request, { ownerId: owner.id });
  await seedLink(request, { ownerId: owner.id });
  const c = { country: "IS", visitorHash: "d" };
  await seedClicks(request, l.id, [
    { ts: now - HOUR, count: 1, ...c },
    { ts: now - 3 * DAY, count: 2, ...c },
    { ts: now - 20 * DAY, count: 4, ...c },
    { ts: now - 60 * DAY, count: 8, ...c },
    { ts: now - 200 * DAY, count: 16, ...c },
    { ts: now - 500 * DAY, count: 32, ...c },
  ]);
  await seedClicks(request, l2.id, [{ ts: now - 2 * HOUR, count: 1 }]);
  await loginAs(page, admin, "/dashboard");

  const range = page.getByRole("group", { name: "Date range" });
  const iceland = page.getByTestId("breakdown-countries").getByRole("row", { name: /Iceland/ });
  await range.getByRole("button", { name: "24 hours" }).click();
  await expect(iceland).toContainText("1");
  await range.getByRole("button", { name: "7 days" }).click();
  await expect(iceland).toContainText("3");
  await range.getByRole("button", { name: "30 days" }).click();
  await expect(iceland).toContainText("7");
  await range.getByRole("button", { name: "90 days" }).click();
  await expect(iceland).toContainText("15");
  await range.getByRole("button", { name: "12 months" }).click();
  await expect(iceland).toContainText("31");
  await range.getByRole("button", { name: "All time" }).click();
  await expect(iceland).toContainText("63");

  // Top links, recently created links, links by owner.
  await expect(page.getByTestId("dash-top-links")).toContainText("Dash probe");
  await expect(page.getByTestId("dash-recent")).toContainText(l2.slug);
  await expect(page.getByTestId("dash-owners").getByRole("row", { name: new RegExp(owned) })).toContainText("2");

  // A top link opens its statistics.
  await page.getByTestId("dash-top-links").getByRole("link", { name: "Dash probe" }).click();
  await expect(page).toHaveURL(new RegExp(`/stats/${l.id}$`));
});

test("a real click through the short domain shows up in the statistics", async ({ page, request }) => {
  const user = await createUser(request, { role: "member" });
  const slug = uniq("real");
  const link = await seedLink(request, { slug, ownerId: user.id });
  const res = await request.get(`${SHORT.replace("s.localhost", HOST)}/${slug}`, {
    maxRedirects: 0,
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      referer: "https://blog.example.net/post",
      "x-test-country": "IT",
      "x-test-city": "Turin",
      "accept-language": "it-IT,it;q=0.9",
    },
  });
  expect(res.status()).toBe(302);
  await loginAs(page, user, `/stats/${link.id}`);
  await expect(value(page, "clicks")).toHaveText("1");
  await expect(page.getByTestId("breakdown-referrers")).toContainText("blog.example.net");
  await expect(page.getByTestId("breakdown-countries")).toContainText("Italy");
  await expect(page.getByTestId("breakdown-cities")).toContainText("Turin");
  await expect(page.getByTestId("breakdown-browsers")).toContainText("Chrome");
});
