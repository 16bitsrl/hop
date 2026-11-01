import { expect, test } from "@playwright/test";
import { APP } from "../playwright.config";
import { HOST, HOUR, seedClicks, seedLink, uniq } from "./stats-helpers";

const shortUrl = (slug: string) => `${APP.replace("app.localhost", HOST)}/${encodeURIComponent(slug)}`;

test("public statistics: read-only data without signing in, 404 when off", async ({ request }) => {
  const on = await seedLink(request, { publicStats: true, notes: "secret internal note", title: "Public one" });
  const off = await seedLink(request, { publicStats: false });
  const now = Date.now();
  await seedClicks(request, on.id, [{ ts: now - HOUR, count: 3, country: "IT", visitorHash: "p1", target: "main" }]);
  await seedClicks(request, off.id, [{ ts: now - HOUR }]);

  const q = `from=${now - 24 * HOUR}&to=${now}&tz=UTC`;
  const res = await request.get(`/api/public/stats/${on.id}?${q}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.totals.clicks).toBe(3);
  expect(body.countries[0]).toEqual({ key: "IT", clicks: 3 });
  expect(body.link).toMatchObject({ slug: on.slug, host: HOST, title: "Public one" });
  const text = JSON.stringify(body);
  expect(text).not.toContain("secret internal note");
  expect(text).not.toContain("ownerId");
  expect(text).not.toContain("example.com/stats");

  expect((await request.get(`/api/public/stats/${off.id}?${q}`)).status()).toBe(404);
  expect((await request.get(`/api/public/stats/does-not-exist?${q}`)).status()).toBe(404);
});

test("public statistics page works signed out and shows nothing private", async ({ browser, request }) => {
  const on = await seedLink(request, { publicStats: true, notes: "hidden note" });
  const off = await seedLink(request, { publicStats: false });
  await seedClicks(request, on.id, [{ ts: Date.now() - HOUR, count: 2, country: "FR" }]);

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${APP}/s/${on.id}`);
  await expect(page.getByTestId("kpi-clicks-value")).toHaveText("2");
  await expect(page.getByTestId("breakdown-countries")).toContainText("France");
  await expect(page.getByText("hidden note")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /export/i })).toHaveCount(0);

  await page.goto(`${APP}/s/${off.id}`);
  await expect(page.getByText("These statistics are not public")).toBeVisible();
  await ctx.close();
});

test("a slug followed by + opens the public statistics when they are on", async ({ request }) => {
  const on = await seedLink(request, { publicStats: true });
  const off = await seedLink(request, { publicStats: false });

  const res = await request.get(shortUrl(`${on.slug}+`), { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers().location).toBe(`${APP}/s/${on.id}`);

  expect((await request.get(shortUrl(`${off.slug}+`), { maxRedirects: 0 })).status()).toBe(404);
  expect((await request.get(shortUrl(`${uniq("missing")}+`), { maxRedirects: 0 })).status()).toBe(404);
  // The plain slug still redirects to the destination.
  expect((await request.get(shortUrl(on.slug), { maxRedirects: 0 })).status()).toBe(302);
  expect((await request.get(shortUrl(on.slug), { maxRedirects: 0 })).headers().location).toBe("https://example.com/stats");
});

test("a real slug that ends with + keeps working as a normal link", async ({ request }) => {
  const slug = `${uniq("plus")}+`;
  await seedLink(request, { slug, url: "https://example.com/plus" });
  const res = await request.get(shortUrl(slug), { maxRedirects: 0 });
  expect(res.headers().location).toBe("https://example.com/plus");
});
