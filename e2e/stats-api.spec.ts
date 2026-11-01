import { expect, test } from "@playwright/test";
import { apiAs, createUser } from "./helpers";
import { DAY, HOUR, seedClicks, seedLink, summary } from "./stats-helpers";

const D1 = Date.UTC(2026, 2, 10, 12); // 2026-03-10 12:00Z
const MARCH = { from: Date.UTC(2026, 2, 1), to: Date.UTC(2026, 2, 31, 23, 59, 59), tz: "UTC" };

test("totals, unique visitors and bot clicks", async ({ request, playwright }) => {
  const user = await createUser(request, { role: "viewer" });
  const api = await apiAs(playwright, user);
  const link = await seedLink(request);
  await seedClicks(request, link.id, [
    { ts: D1, count: 3, visitorHash: "aaaa" },
    { ts: D1 + HOUR, visitorHash: "bbbb" },
    { ts: D1 + 2 * HOUR, count: 2, visitorHash: "cccc", bot: true },
    { ts: D1 + DAY, visitorHash: "aaaa" },
  ]);

  // Bots are left out by default; the number of bot clicks is still reported.
  const humans = await summary(api, { linkId: link.id, ...MARCH });
  expect(humans.totals).toEqual({ clicks: 5, visitors: 3, bots: 2 });
  expect(humans.link).toMatchObject({ id: link.id, slug: link.slug });

  // Same visitor on two different days counts twice; with bots they are included.
  const all = await summary(api, { linkId: link.id, ...MARCH, bots: 1 });
  expect(all.totals).toEqual({ clicks: 7, visitors: 4, bots: 2 });

  // Nothing outside the range.
  const empty = await summary(api, { linkId: link.id, from: Date.UTC(2026, 3, 1), to: Date.UTC(2026, 3, 30), tz: "UTC" });
  expect(empty.totals).toEqual({ clicks: 0, visitors: 0, bots: 0 });
  await api.dispose();
});

test("time series uses the viewer's time zone and includes empty days", async ({ request, playwright }) => {
  const user = await createUser(request, { role: "member" });
  const api = await apiAs(playwright, user);
  const link = await seedLink(request);
  await seedClicks(request, link.id, [
    { ts: Date.UTC(2026, 5, 10, 23, 30) },
    { ts: Date.UTC(2026, 5, 11, 0, 30) },
    { ts: Date.UTC(2026, 5, 11, 20, 0) },
  ]);
  const range = { linkId: link.id, from: Date.UTC(2026, 5, 9), to: Date.UTC(2026, 5, 12) };
  const asMap = (s: { series: { key: string; clicks: number }[] }) => Object.fromEntries(s.series.map((p) => [p.key, p.clicks]));

  const utc = await summary(api, { ...range, tz: "UTC" });
  expect(utc.range.bucket).toBe("day");
  expect(utc.series.map((p) => p.key)).toEqual(["2026-06-09", "2026-06-10", "2026-06-11", "2026-06-12"]);
  expect(asMap(utc)).toEqual({ "2026-06-09": 0, "2026-06-10": 1, "2026-06-11": 2, "2026-06-12": 0 });

  // Tokyo is UTC+9: the late click moves to the next day.
  const tokyo = await summary(api, { ...range, tz: "Asia/Tokyo" });
  expect(asMap(tokyo)).toMatchObject({ "2026-06-10": 0, "2026-06-11": 2, "2026-06-12": 1 });

  // Los Angeles is UTC-7 in June: the first two clicks are on the 10th.
  const la = await summary(api, { ...range, tz: "America/Los_Angeles" });
  expect(asMap(la)).toMatchObject({ "2026-06-09": 0, "2026-06-10": 2, "2026-06-11": 1 });

  // Hour buckets for short ranges.
  const hours = await summary(api, { linkId: link.id, from: Date.UTC(2026, 5, 10, 22), to: Date.UTC(2026, 5, 11, 2), tz: "UTC" });
  expect(hours.range.bucket).toBe("hour");
  expect(asMap(hours)).toEqual({
    "2026-06-10T22": 0,
    "2026-06-10T23": 1,
    "2026-06-11T00": 1,
    "2026-06-11T01": 0,
    "2026-06-11T02": 0,
  });
  await api.dispose();
});

test("breakdowns by referrer, country, city, device, OS, browser and language", async ({ request, playwright }) => {
  const user = await createUser(request, { role: "member" });
  const api = await apiAs(playwright, user);
  const link = await seedLink(request);
  const ts = D1;
  await seedClicks(request, link.id, [
    { ts, count: 3, referrerHost: "news.example.org", country: "IT", city: "Rome", device: "mobile", os: "iOS", browser: "Safari", language: "it" },
    { ts, count: 2, referrerHost: null, country: "DE", city: "Berlin", device: "desktop", os: "macOS", browser: "Chrome", language: "de" },
    { ts, count: 1, referrerHost: "news.example.org", country: "IT", city: "Milan", device: "desktop", os: "Windows", browser: "Chrome", language: "it" },
    { ts, count: 1, country: null, city: null, device: null, os: null, browser: null, language: null },
    { ts, count: 4, bot: true, country: "US", referrerHost: "bots.example.org" },
  ]);
  const s = await summary(api, { linkId: link.id, ...MARCH });
  expect(s.referrers).toEqual([
    { key: "news.example.org", clicks: 4 },
    { key: null, clicks: 3 }, // direct
  ]);
  expect(s.countries).toEqual([
    { key: "IT", clicks: 4 },
    { key: "DE", clicks: 2 },
    { key: null, clicks: 1 },
  ]);
  expect(s.cities.slice(0, 3)).toEqual([
    { key: "Rome", country: "IT", clicks: 3 },
    { key: "Berlin", country: "DE", clicks: 2 },
    { key: "Milan", country: "IT", clicks: 1 },
  ]);
  expect(s.devices).toEqual([
    { key: "desktop", clicks: 3 },
    { key: "mobile", clicks: 3 },
    { key: null, clicks: 1 },
  ]);
  expect(s.os.map((r) => r.key)).toContain("iOS");
  expect(s.browsers[0]).toEqual({ key: "Chrome", clicks: 3 });
  expect(s.languages[0]).toEqual({ key: "it", clicks: 4 });

  const withBots = await summary(api, { linkId: link.id, ...MARCH, bots: 1 });
  expect(withBots.countries[0]).toEqual({ key: "IT", clicks: 4 });
  expect(withBots.countries.find((r) => r.key === "US")).toEqual({ key: "US", clicks: 4 });
  await api.dispose();
});

test("A/B variants and rules are measurable per target", async ({ request, playwright }) => {
  const user = await createUser(request, { role: "member" });
  const api = await apiAs(playwright, user);
  const link = await seedLink(request, {
    url: "https://example.com/main",
    rules: [{ countries: ["IT"], url: "https://example.com/it" }],
    variants: [
      { url: "https://example.com/a", weight: 1 },
      { url: "https://example.com/b", weight: 1 },
    ],
  });
  await seedClicks(request, link.id, [
    { ts: D1, count: 5, target: "variant:0", visitorHash: "v1" },
    { ts: D1, count: 3, target: "variant:1", visitorHash: "v2" },
    { ts: D1, count: 2, target: "rule:0", visitorHash: "v3" },
    { ts: D1, count: 1, target: null, visitorHash: "v4" },
  ]);
  const s = await summary(api, { linkId: link.id, ...MARCH });
  expect(s.targets).toEqual([
    { target: "variant:0", url: "https://example.com/a", clicks: 5, visitors: 1 },
    { target: "variant:1", url: "https://example.com/b", clicks: 3, visitors: 1 },
    { target: "rule:0", url: "https://example.com/it", clicks: 2, visitors: 1 },
    { target: "main", url: "https://example.com/main", clicks: 1, visitors: 1 },
  ]);

  // A target that was never served still shows up, with zero clicks.
  const quiet = await summary(api, { linkId: link.id, from: Date.UTC(2026, 3, 1), to: Date.UTC(2026, 3, 2), tz: "UTC" });
  expect(quiet.targets.map((t) => [t.target, t.clicks])).toEqual([
    ["main", 0],
    ["rule:0", 0],
    ["variant:0", 0],
    ["variant:1", 0],
  ]);
  await api.dispose();
});

test("installation-wide dashboard data", async ({ request, playwright }) => {
  const user = await createUser(request, { role: "member", name: "Dash Owner Zed" });
  const api = await apiAs(playwright, user);
  const a = await seedLink(request, { ownerId: user.id, title: "Top one" });
  const b = await seedLink(request, { ownerId: user.id });
  const range = { from: Date.UTC(2020, 0, 1), to: Date.UTC(2020, 0, 31), tz: "UTC" };
  await seedClicks(request, a.id, [{ ts: Date.UTC(2020, 0, 5), count: 4, country: "NZ" }]);
  await seedClicks(request, b.id, [{ ts: Date.UTC(2020, 0, 6), count: 2, country: "NZ" }]);

  const qs = new URLSearchParams({ from: String(range.from), to: String(range.to), tz: range.tz });
  const res = await api.get(`/api/stats/dashboard?${qs}`);
  expect(res.ok()).toBeTruthy();
  const d = await res.json();
  expect(d.totals.clicks).toBe(6);
  expect(d.countries[0]).toEqual({ key: "NZ", clicks: 6 });
  expect(d.topLinks.map((l: { id: string; clicks: number }) => [l.id, l.clicks])).toEqual([
    [a.id, 4],
    [b.id, 2],
  ]);
  expect(d.topLinks[0]).toMatchObject({ slug: a.slug, host: "stats.localhost", title: "Top one" });
  expect(d.recentLinks.map((l: { id: string }) => l.id)).toEqual(expect.arrayContaining([a.id, b.id]));
  expect(d.linksByOwner).toEqual(expect.arrayContaining([{ ownerId: user.id, name: "Dash Owner Zed", links: 2 }]));
  await api.dispose();
});

test("requires sign-in and valid parameters", async ({ request, playwright }) => {
  const anon = await request.get(`/api/stats/summary?from=0&to=10&tz=UTC`);
  expect(anon.status()).toBe(401);
  expect((await request.get("/api/stats/dashboard?from=0&to=10")).status()).toBe(401);

  const user = await createUser(request, { role: "viewer" });
  const api = await apiAs(playwright, user);
  expect((await api.get("/api/stats/summary?from=10&to=5&tz=UTC")).status()).toBe(400);
  expect((await api.get("/api/stats/summary?from=0&to=10&tz=Mars/Base")).status()).toBe(400);
  expect((await api.get("/api/stats/summary?linkId=nope&from=0&to=10&tz=UTC")).status()).toBe(404);
  await api.dispose();
});

test("CSV export: raw clicks without IP, and aggregated tables", async ({ request, playwright }) => {
  const user = await createUser(request, { role: "member" });
  const api = await apiAs(playwright, user);
  const link = await seedLink(request);
  await seedClicks(request, link.id, [
    { ts: D1, count: 2, referrerHost: "news.example.org", country: "IT", device: "mobile", visitorHash: "zzzz1111", target: "main" },
    { ts: D1 + HOUR, referrerHost: "=HYPERLINK(1)", country: "DE", device: "desktop", visitorHash: "yyyy2222", target: "variant:0" },
  ]);
  const qs = new URLSearchParams({ linkId: link.id, from: String(MARCH.from), to: String(MARCH.to), tz: "UTC" });

  const raw = await api.get(`/api/stats/export.csv?${qs}&kind=clicks`);
  expect(raw.status()).toBe(200);
  expect(raw.headers()["content-type"]).toContain("text/csv");
  expect(raw.headers()["content-disposition"]).toContain("attachment");
  const rawText = (await raw.text()).replace("﻿", "");
  const lines = rawText.trim().split("\r\n");
  expect(lines[0]).toBe("time,link,referrer_host,country,region,city,device,os,browser,language,bot,target");
  expect(lines).toHaveLength(4);
  expect(lines[1]).toContain("2026-03-10T12:00:00.000Z");
  expect(lines[1]).toContain("news.example.org,IT");
  expect(lines[3]).toContain("'=HYPERLINK(1)");
  expect(rawText).not.toContain("zzzz1111"); // visitors are never exported

  const agg = await api.get(`/api/stats/export.csv?${qs}&kind=summary`);
  const aggText = (await agg.text()).replace("﻿", "");
  expect(aggText).toContain("section,label,clicks");
  expect(aggText).toContain("total,clicks,3");
  expect(aggText).toContain("countries,IT,2");
  expect(aggText).toContain("devices,mobile,2");
  expect(aggText).toContain("targets,variant:0,1");
  await api.dispose();
});
