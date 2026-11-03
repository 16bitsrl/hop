import { expect, test, type APIRequestContext } from "@playwright/test";
import { SHORT } from "../playwright.config";

const HOST = "s.localhost";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

let n = 0;
const uniq = (p: string) => `${p}-${Date.now().toString(36)}${n++}`;

async function seed(request: APIRequestContext, link: Record<string, unknown>, domain: Record<string, unknown> = {}) {
  const res = await request.post("/api/_test/links", { data: { host: HOST, ...domain, ...link } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as { id: string; slug: string; domainId: string };
}
const get = (request: APIRequestContext, slug: string, headers: Record<string, string> = {}, q = "") =>
  request.get(`${SHORT}/${slug}${q}`, { maxRedirects: 0, headers: { "user-agent": DESKTOP, ...headers } });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClickRow = Record<string, any>;
async function clicks(request: APIRequestContext, linkId: string, min = 1) {
  let rows: ClickRow[] = [];
  await expect
    .poll(async () => {
      rows = (await (await request.get(`/api/_test/clicks?linkId=${linkId}`)).json()) as ClickRow[];
      return rows.length;
    })
    .toBeGreaterThanOrEqual(min);
  return rows;
}

test("basic redirect with status and cache headers, logs a click", async ({ request }) => {
  const slug = uniq("basic");
  const l = await seed(request, { slug, url: "https://example.com/a", redirectType: 301 });
  const res = await get(request, slug, { referer: "https://news.example.org/post", "accept-language": "it-IT,it;q=0.9" });
  expect(res.status()).toBe(301);
  expect(res.headers().location).toBe("https://example.com/a");
  expect(res.headers()["cache-control"]).toBe("private, max-age=0");
  expect(res.headers()["referrer-policy"]).toBeTruthy();
  const rows = await clicks(request, l.id);
  expect(rows[0]).toMatchObject({
    referrerHost: "news.example.org",
    language: "it",
    device: "desktop",
    bot: false,
    target: "main",
    source: "live",
  });
  expect(rows[0]!.visitorHash).toMatch(/^[0-9a-f]{16}$/);
});

test("trailing slash ignored, case sensitive", async ({ request }) => {
  const slug = uniq("Case-Slug");
  await seed(request, { slug, url: "https://example.com/c" });
  expect((await get(request, `${slug}/`)).status()).toBe(302);
  expect((await get(request, slug.toLowerCase())).status()).toBe(404);
});

test("unknown domain is a plain 404; root and not-found redirect urls", async ({ request }) => {
  const port = new URL(SHORT).port;
  const res = await request.get(`http://nope.localhost:${port}/x`, { maxRedirects: 0 });
  expect(res.status()).toBe(404);
  await seed(
    request,
    { slug: uniq("d"), url: "https://example.com" },
    { host: "r.localhost", rootUrl: "https://example.com/root", notFoundUrl: "https://example.com/nf" },
  );
  const root = await request.get(`http://r.localhost:${port}/`, { maxRedirects: 0 });
  expect(root.status()).toBe(302);
  expect(root.headers().location).toBe("https://example.com/root");
  const nf = await request.get(`http://r.localhost:${port}/zzz`, { maxRedirects: 0 });
  expect(nf.status()).toBe(302);
  expect(nf.headers().location).toBe("https://example.com/nf");
});

test("landing page and 404 page are built in", async ({ request }) => {
  await seed(request, { slug: uniq("x"), url: "https://example.com" });
  const root = await request.get(`${SHORT}/`, { maxRedirects: 0 });
  expect(root.status()).toBe(200);
  expect(root.headers()["content-type"]).toContain("text/html");
  const landing = await root.text();
  // The landing names the short domain and shows the mark.
  expect(landing).toContain(`<h1>${new URL(SHORT).host}</h1>`);
  expect(landing).toContain('<svg class="mark"');
  const rootIt = await request.get(`${SHORT}/`, { maxRedirects: 0, headers: { "accept-language": "it" } });
  expect(await rootIt.text()).toContain("arrivi subito");
  const nf = await get(request, uniq("missing"), { "accept-language": "it" });
  expect(nf.status()).toBe(404);
  expect(await nf.text()).toContain("non trovato");
});

test("disabled and expired links", async ({ request }) => {
  const a = uniq("dis");
  await seed(request, { slug: a, url: "https://example.com", enabled: false });
  expect((await get(request, a)).status()).toBe(404);
  const b = uniq("dis-fb");
  await seed(request, { slug: b, url: "https://example.com", enabled: false, fallbackUrl: "https://example.com/fb" });
  expect((await get(request, b)).headers().location).toBe("https://example.com/fb");

  const c = uniq("exp");
  await seed(request, { slug: c, url: "https://example.com", expiresAt: Date.now() - 1000 });
  expect((await get(request, c)).status()).toBe(410);
  const d = uniq("exp-fb");
  await seed(request, {
    slug: d,
    url: "https://example.com",
    expiresAt: Date.now() - 1000,
    fallbackUrl: "https://example.com/fb",
  });
  expect((await get(request, d)).headers().location).toBe("https://example.com/fb");
  const e = uniq("max");
  await seed(request, { slug: e, url: "https://example.com", maxClicks: 1, clickCount: 1 });
  expect((await get(request, e)).status()).toBe(410);
});

test("device, country and language rules, variants", async ({ request }) => {
  const slug = uniq("rules");
  const l = await seed(request, {
    slug,
    url: "https://example.com/main",
    rules: [
      { devices: ["ios"], url: "https://example.com/ios" },
      { countries: ["IT"], url: "https://example.com/it" },
      { languages: ["fr"], url: "https://example.com/fr" },
    ],
  });
  expect((await get(request, slug, { "user-agent": IPHONE })).headers().location).toBe("https://example.com/ios");
  expect((await get(request, slug, { "x-test-country": "IT" })).headers().location).toBe("https://example.com/it");
  expect((await get(request, slug, { "accept-language": "fr-FR,fr;q=0.9" })).headers().location).toBe(
    "https://example.com/fr",
  );
  expect((await get(request, slug)).headers().location).toBe("https://example.com/main");
  const rows = await clicks(request, l.id, 4);
  expect(rows.map((r) => r.target).sort()).toEqual(["main", "rule:0", "rule:1", "rule:2"]);

  const v = uniq("ab");
  await seed(request, { slug: v, url: "https://example.com/main", variants: [{ url: "https://example.com/only", weight: 1 }] });
  expect((await get(request, v)).headers().location).toBe("https://example.com/only");
});

test("query forwarding", async ({ request }) => {
  const slug = uniq("fq");
  await seed(request, { slug, url: "https://example.com/p?a=1&b=2", forwardQuery: true });
  expect((await get(request, slug, {}, "?b=9&utm_source=x")).headers().location).toBe(
    "https://example.com/p?a=1&b=9&utm_source=x",
  );
  const off = uniq("fq-off");
  await seed(request, { slug: off, url: "https://example.com/p?a=1" });
  expect((await get(request, off, {}, "?b=9")).headers().location).toBe("https://example.com/p?a=1");
});

test("social preview for crawlers only", async ({ request }) => {
  const slug = uniq("og");
  const l = await seed(request, {
    slug,
    url: "https://example.com/og",
    ogTitle: "Hello <b>world</b>",
    ogDescription: 'A "desc"',
    ogImage: "https://example.com/i.png",
  });
  const bot = await get(request, slug, { "user-agent": "facebookexternalhit/1.1" });
  expect(bot.status()).toBe(200);
  const html = await bot.text();
  expect(html).toContain('property="og:title"');
  expect(html).toContain("Hello &lt;b&gt;world&lt;/b&gt;");
  expect(html).toContain("twitter:card");
  expect(html).toContain('http-equiv="refresh"');
  expect(html).not.toContain("<b>world</b>");
  expect((await get(request, slug)).status()).toBe(302);
  const rows = await clicks(request, l.id, 2);
  expect(rows.some((r) => r.bot === true)).toBe(true);
});

test("deep link page on iOS, plain redirect on desktop", async ({ request, browser }) => {
  const slug = uniq("deep");
  await seed(request, { slug, url: "https://example.com/web", appUrl: "myapp://open/1" });
  expect((await get(request, slug)).status()).toBe(302);
  const ctx = await browser.newContext({ userAgent: IPHONE });
  const res = await ctx.request.get(`${SHORT}/${slug}`, { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain("myapp://open/1");
  expect(html).toContain("https://example.com/web");
  // the page itself falls back to the web url
  const page = await ctx.newPage();
  await page.route("https://example.com/**", (r) => r.fulfill({ body: "<title>web fallback</title>" }));
  await page.route("myapp://**", (r) => r.abort());
  await page.goto(`${SHORT}/${slug}`);
  await page.waitForURL("https://example.com/web", { timeout: 8000 });
  await ctx.close();
});

test("password protected link", async ({ request, page }) => {
  const slug = uniq("pw");
  const l = await seed(request, { slug, url: "https://example.com/secret", password: "open-sesame" });
  const res = await get(request, slug);
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("no-store");
  await page.route("https://example.com/**", (r) => r.fulfill({ body: "<title>secret target</title>" }));
  await page.goto(`${SHORT}/${slug}`);
  await page.fill('input[type="password"]', "wrong");
  await page.click('button[type="submit"]');
  await expect(page.getByRole("alert")).toBeVisible();
  await page.fill('input[type="password"]', "open-sesame");
  await page.click('button[type="submit"]');
  await page.waitForURL("https://example.com/secret");
  const rows = await clicks(request, l.id, 1);
  expect(rows).toHaveLength(1);
  // the cookie lets the same browser straight through
  const again = await page.request.get(`${SHORT}/${slug}`, { maxRedirects: 0 });
  expect(again.status()).toBe(302);
});

test("only http(s) destinations are followed", async ({ request }) => {
  const slug = uniq("bad");
  await seed(request, { slug, url: "javascript:alert(1)" });
  expect((await get(request, slug)).status()).toBe(404);
});

const counters = async (request: APIRequestContext, linkId: string) =>
  (await (await request.get(`/api/_test/link-counters?linkId=${linkId}`)).json()) as { clickCount: number };

test("a link with a click limit lets exactly that many visitors through, even in parallel", async ({ request }) => {
  const slug = uniq("race");
  const l = await seed(request, { slug, url: "https://example.com/limited", maxClicks: 1 });
  const answers = await Promise.all(Array.from({ length: 8 }, () => get(request, slug)));
  const statuses = answers.map((r) => r.status()).sort();
  expect(statuses.filter((s) => s === 302)).toHaveLength(1);
  expect(statuses.filter((s) => s === 410)).toHaveLength(7);
  await clicks(request, l.id, 1);
  expect((await counters(request, l.id)).clickCount).toBe(1);
});

test("link preview bots and crawlers do not use up the click limit or the click counter", async ({ request }) => {
  const slug = uniq("bots");
  const l = await seed(request, { slug, url: "https://example.com/limited", maxClicks: 1 });
  const slack = await get(request, slug, { "user-agent": "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)" });
  expect(slack.status()).toBe(302);
  const generic = await get(request, slug, { "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" });
  expect(generic.status()).toBe(302);
  const rows = await clicks(request, l.id, 2);
  expect(rows.every((r) => !!r.bot)).toBe(true);
  expect((await counters(request, l.id)).clickCount).toBe(0);
  // A person can still use the one allowed visit.
  expect((await get(request, slug)).status()).toBe(302);
  expect((await get(request, slug)).status()).toBe(410);
  expect((await counters(request, l.id)).clickCount).toBe(1);
});

test("on links without a limit, bots are logged but only people count", async ({ request }) => {
  const slug = uniq("botcount");
  const l = await seed(request, { slug, url: "https://example.com/a" });
  await get(request, slug, { "user-agent": "Slackbot-LinkExpanding 1.0" });
  await get(request, slug);
  await clicks(request, l.id, 2);
  await expect.poll(async () => (await counters(request, l.id)).clickCount).toBe(1);
});

test("a slug followed by .qr or .qrv shows its QR code, like YOURLS", async ({ request }) => {
  const slug = uniq("qr");
  const l = await seed(request, { slug, url: "https://example.com/qr" });
  for (const suffix of [".qr"]) {
    const png = await get(request, slug + suffix);
    expect(png.status(), suffix).toBe(200);
    expect(png.headers()["content-type"]).toBe("image/png");
    expect((await png.body()).subarray(1, 4).toString()).toBe("PNG");
  }
  for (const suffix of [".qrv"]) {
    const svg = await get(request, slug + suffix);
    expect(svg.status(), suffix).toBe(200);
    expect(svg.headers()["content-type"]).toContain("image/svg+xml");
    expect(await svg.text()).toContain("<svg");
  }
  // Looking at the code is not a visit.
  const rows = (await (await request.get(`/api/_test/clicks?linkId=${l.id}`)).json()) as unknown[];
  expect(rows).toHaveLength(0);
  expect((await get(request, `${uniq("missing")}.qr`)).status()).toBe(404);
  // Only the full .qr and .qrv, not the bare dot or .v.
  for (const suffix of [".", ".v"]) expect((await get(request, slug + suffix)).status(), suffix).toBe(404);
});

test("www in front of a short domain goes to the domain itself, only for second-level domains", async ({ request }) => {
  const slug = uniq("www");
  await seed(request, { slug, url: "https://example.com/www" });
  const www = (host: string, path: string) => request.get(`${SHORT.replace("//s.localhost", `//${host}`)}${path}`, { maxRedirects: 0 });
  const res = await www("www.s.localhost", `/${slug}?utm_source=x`);
  expect(res.status()).toBe(301);
  expect(res.headers().location).toBe(`${SHORT}/${slug}?utm_source=x`);
  // A deeper domain is not second-level: its www is left alone.
  await seed(request, { slug: uniq("deep"), url: "https://example.com/deep" }, { host: "go.s.localhost" });
  expect((await www("www.go.s.localhost", `/${slug}`)).status()).toBe(404);
});
