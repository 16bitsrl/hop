// Takes the screenshots used by README.md and FEATURES.md.
//
//   pnpm build:node && node scripts/screenshots.mjs
//   pngquant --quality=80-95 --skip-if-larger --force --ext .png .github/screenshots/*.png   (optional, smaller files)
//
// Starts the Node build on a throwaway SQLite database in a temporary directory, fills it with
// made-up data through the test-only routes and the public API, and saves PNGs in
// .github/screenshots/. The browser reaches hop.example.com and go.example.com through a small
// local proxy, so no real DNS is involved and nothing outside the temporary directory is touched.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import tls from "node:tls";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import Database from "better-sqlite3";

const PORT = 8830;
const PROXY_PORT = 8831;
const APP = "https://hop.example.com";
const OUT = path.resolve(".github/screenshots");
const dataDir = mkdtempSync(path.join(tmpdir(), "hop-screens-"));

const server = spawn("node", ["dist/node/server.mjs"], {
  stdio: ["ignore", "inherit", "inherit"],
  env: {
    ...process.env,
    DATA_DIR: dataDir,
    PORT: String(PORT),
    APP_HOST: "hop.example.com",
    APP_URL: APP,
    AUTH_SECRET: "screenshots-secret-screenshots-secret-1",
    TEST_MODE: "1",
    STATIC_DIR: "dist/client",
    MIGRATIONS_DIR: "migrations",
  },
});

// HTTPS proxy: the browser opens a CONNECT tunnel to hop.example.com:443, the proxy ends TLS with a
// throwaway self-signed certificate and hands the plain request to the local server, Host unchanged.
execFileSync("openssl", [
  "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=hop.example.com",
  "-keyout", path.join(dataDir, "key.pem"), "-out", path.join(dataDir, "cert.pem"),
], { stdio: "ignore" });
const tlsOptions = { isServer: true, key: readFileSync(path.join(dataDir, "key.pem")), cert: readFileSync(path.join(dataDir, "cert.pem")) };
const proxy = http.createServer((_req, res) => res.writeHead(400).end());
proxy.on("connect", (_req, socket, head) => {
  socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
  if (head.length) socket.unshift(head);
  const secure = new tls.TLSSocket(socket, tlsOptions);
  const upstream = net.connect(PORT, "127.0.0.1");
  secure.pipe(upstream);
  upstream.pipe(secure);
  for (const s of [socket, secure, upstream]) s.on("error", () => [socket, upstream].forEach((x) => x.destroy()));
});
await new Promise((ok) => proxy.listen(PROXY_PORT, "127.0.0.1", ok));

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    const ok = await new Promise((resolve) => {
      http
        .get({ host: "127.0.0.1", port: PORT, path: "/healthz", headers: { host: "hop.example.com" } }, (r) => resolve(r.statusCode === 200))
        .on("error", () => resolve(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("server did not start");
}

const DAY = 86_400_000;
const now = Date.now();

// Deterministic randomness, so the screenshots only change when the UI does.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (weighted) => {
  const total = weighted.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of weighted) if ((r -= w) <= 0) return v;
  return weighted[0][0];
};

const PLACES = [
  [["IT", "Milan"], 30], [["IT", "Rome"], 14], [["IT", "Turin"], 6], [["US", "New York"], 12], [["US", "San Francisco"], 6],
  [["DE", "Berlin"], 9], [["GB", "London"], 8], [["FR", "Paris"], 7], [["ES", "Madrid"], 5], [["NL", "Amsterdam"], 4],
  [["CH", "Zurich"], 3], [["BR", "São Paulo"], 2],
];
const AGENTS = [
  [{ device: "mobile", os: "iOS", browser: "Mobile Safari" }, 30], [{ device: "mobile", os: "Android", browser: "Chrome" }, 22],
  [{ device: "desktop", os: "macOS", browser: "Chrome" }, 18], [{ device: "desktop", os: "Windows", browser: "Edge" }, 9],
  [{ device: "desktop", os: "Windows", browser: "Chrome" }, 9], [{ device: "desktop", os: "macOS", browser: "Safari" }, 6],
  [{ device: "tablet", os: "iOS", browser: "Mobile Safari" }, 4], [{ device: "desktop", os: "Linux", browser: "Firefox" }, 2],
];
const REFERRERS = [
  [null, 34], ["l.instagram.com", 20], ["www.google.com", 12], ["www.linkedin.com", 10], ["t.co", 7], ["mail.example.com", 9],
  ["news.ycombinator.com", 3], ["www.facebook.com", 5],
];
const LANGS = { IT: "it", US: "en", GB: "en", DE: "de", FR: "fr", ES: "es", NL: "nl", CH: "de", BR: "pt" };

function makeClicks(total, days, { targets } = {}) {
  const clicks = [];
  for (let i = 0; i < total; i++) {
    // More recent days get more traffic, weekends a little less.
    const ts = now - Math.floor((1 - Math.sqrt(1 - rand())) * days * DAY);
    const weekday = new Date(ts).getDay();
    if ((weekday === 0 || weekday === 6) && rand() < 0.35) continue;
    const [country, city] = pick(PLACES);
    const bot = rand() < 0.04;
    clicks.push({
      ts,
      country,
      city,
      ...pick(AGENTS),
      referrerHost: pick(REFERRERS),
      language: LANGS[country],
      visitorHash: `v${Math.floor(rand() * total * 0.7)}`,
      bot,
      target: targets ? pick(targets) : "main",
    });
  }
  return clicks;
}

try {
  await waitForServer();
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ proxy: { server: `http://127.0.0.1:${PROXY_PORT}` } });
  const base = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: "en-US", timezoneId: "Europe/Rome", colorScheme: "light", serviceWorkers: "block", ignoreHTTPSErrors: true };
  const context = await browser.newContext(base);
  const client = (api) => async (url, data, method = "post") => {
    const res = await api[method](`${APP}${url}`, { data, headers: { origin: APP } });
    if (!res.ok()) throw new Error(`${method} ${url}: ${res.status()} ${await res.text()}`);
    return res.json();
  };
  const post = client(context.request);
  /** A second signed-in client, so links have different owners. */
  const as = async (user) => {
    const ctx = await browser.newContext(base);
    const p = client(ctx.request);
    await p("/api/auth/sign-in/email", { email: user.email, password: user.password });
    return p;
  };

  // People
  const mkUser = (name, email, role) => post("/api/_test/users", { name, email, role, password: "screenshots-123" });
  const alex = await mkUser("Alex Morgan", "alex@example.com", "admin");
  const sam = await mkUser("Sam Patel", "sam@example.com", "member");
  const jordan = await mkUser("Jordan Lee", "jordan@example.com", "member");
  await mkUser("Riley Chen", "riley@example.com", "viewer");
  await post("/api/auth/sign-in/email", { email: alex.email, password: alex.password });
  await post("/api/invites", { email: "casey@example.com", role: "member" }).catch(() => {});

  // Domains, folders, tags
  const go = (await post("/api/domains", { host: "go.example.com", rootUrl: "https://www.example.com" })).domain;
  await post("/api/domains", { host: "promo.example.net", notFoundUrl: "https://www.example.com/not-found" });
  const folder = async (name, parentId) => (await post("/api/folders", { name, parentId })).folder.id;
  const marketing = await folder("Marketing");
  const spring = await folder("Spring campaign", marketing);
  const product = await folder("Product");
  const events = await folder("Events");
  const social = await folder("Social");

  // Links
  const asSam = await as(sam);
  const asJordan = await as(jordan);
  const link = async (body, by = post) => (await by("/api/links", { domainId: go.id, fetchMeta: false, ...body })).link;
  const L = {};
  L.launch = await link({ slug: "launch", url: "https://www.example.com/blog/introducing-orbit", title: "Introducing Orbit, our new app", folderId: product, tags: ["launch", "newsletter"], notes: "Linked from the October newsletter and the press release.", publicStats: true });
  L.spring = await link({ slug: "spring-sale", url: "https://shop.example.com/collections/spring?utm_source=newsletter&utm_medium=email&utm_campaign=spring", title: "Spring sale: up to 40% off", folderId: spring, tags: ["newsletter", "sale"] });
  L.app = await link({
    slug: "app",
    url: "https://www.example.com/orbit",
    title: "Get the Orbit app",
    folderId: product,
    tags: ["launch"],
    rules: [
      { devices: ["ios"], url: "https://apps.apple.com/app/id0000000000" },
      { devices: ["android"], url: "https://play.google.com/store/apps/details?id=com.example.orbit" },
    ],
  });
  L.store = await link({
    slug: "store",
    url: "https://shop.example.com/",
    title: "Shop in your country",
    folderId: marketing,
    tags: ["sale"],
    rules: [
      { countries: ["IT", "CH"], url: "https://shop.example.com/it" },
      { countries: ["DE", "AT"], url: "https://shop.example.com/de" },
      { languages: ["fr"], url: "https://shop.example.com/fr" },
    ],
  });
  L.pricing = await link({ slug: "pricing", url: "https://www.example.com/pricing", title: "Pricing page test", folderId: product, variants: [{ url: "https://www.example.com/pricing?v=a", weight: 50 }, { url: "https://www.example.com/pricing?v=b", weight: 50 }] });
  L.menu = await link({ slug: "menu", url: "https://www.example.com/events/dinner-menu.pdf", title: "Gala dinner menu", folderId: events, tags: ["print"] }, asJordan);
  L.webinar = await link({ slug: "webinar", url: "https://events.example.com/webinar-november", title: "Webinar: shipping faster", folderId: events, expiresAt: now + 20 * DAY, fallbackUrl: "https://events.example.com/recordings", tags: ["newsletter"] }, asJordan);
  L.press = await link({ slug: "press-kit", url: "https://www.example.com/press/press-kit.zip", title: "Press kit", folderId: marketing, password: "press2026", tags: ["press"] });
  L.ig = await link({ slug: "ig", url: "https://www.example.com/?utm_source=instagram&utm_medium=social&utm_campaign=bio", title: "Instagram bio link", folderId: social, tags: ["instagram"] }, asSam);
  L.podcast = await link({ slug: "ep42", url: "https://podcasts.example.com/orbit/episodes/42", title: "Podcast #42: building in public", folderId: social, tags: ["podcast"] }, asSam);
  L.docs = await link({ slug: "docs", url: "https://docs.example.com/getting-started", title: "Getting started guide", folderId: product, tags: ["docs"] });
  L.jobs = await link({ slug: "jobs", url: "https://jobs.example.com/", title: "We are hiring", tags: ["careers"] }, asJordan);
  L.survey = await link({ slug: "survey-2025", url: "https://forms.example.com/survey-2025", title: "2025 customer survey (closed)", folderId: marketing, enabled: false });

  // Some history on one link
  await post(`/api/links/${L.launch.id}`, { url: "https://www.example.com/blog/introducing-orbit?ref=short" }, "patch");
  await post(`/api/links/${L.launch.id}`, { tags: ["launch", "newsletter", "press"] }, "patch");
  await post(`/api/links/${L.launch.id}`, { ogTitle: "Introducing Orbit", ogDescription: "Plan, ship and share your work in one place." }, "patch");

  // Clicks
  const traffic = [
    [L.launch, 2600, 30], [L.spring, 1500, 25], [L.app, 1100, 30, [["rule:0", 48], ["rule:1", 34], ["main", 18]]],
    [L.store, 700, 30, [["rule:0", 40], ["rule:1", 15], ["rule:2", 8], ["main", 37]]], [L.pricing, 900, 14, [["variant:0", 52], ["variant:1", 48]]],
    [L.menu, 240, 10], [L.webinar, 380, 20], [L.press, 90, 30], [L.ig, 1300, 30], [L.podcast, 420, 21], [L.docs, 520, 30], [L.jobs, 160, 30],
    [L.survey, 300, 30],
  ];
  for (const [l, total, days, targets] of traffic) {
    const clicks = makeClicks(total, days, { targets });
    for (let i = 0; i < clicks.length; i += 500) await post("/api/_test/clicks", { linkId: l.id, clicks: clicks.slice(i, i + 500) });
  }
  // The link counters normally grow with each visit; recompute them from the seeded clicks.
  const db = new Database(path.join(dataDir, "hop.db"));
  db.exec(`UPDATE links SET
    click_count = (SELECT count(*) FROM clicks WHERE clicks.link_id = links.id AND bot = 0),
    last_clicked_at = (SELECT max(ts) FROM clicks WHERE clicks.link_id = links.id)`);
  db.close();

  const page = await context.newPage();
  const shot = async (name, opts = {}) => {
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600); // charts animate in
    await page.screenshot({ path: path.join(OUT, `${name}.png`), ...opts });
    console.log(`saved ${name}.png`);
  };
  const open = async (p) => {
    await page.goto(`${APP}${p}`);
    await page.waitForLoadState("networkidle");
  };
  const tab = async (name) => {
    await page.getByRole("tab", { name, exact: true }).click();
  };

  await open("/links");
  await shot("links");

  await page.getByRole("button", { name: /new link/i }).first().click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("dialog").getByLabel(/destination/i).first().fill("https://www.example.com/blog/orbit-2-0");
  await shot("create-link");
  await page.keyboard.press("Escape");

  await open(`/links/${L.launch.id}`);
  await shot("link-overview");
  await open(`/links/${L.app.id}`);
  await tab("Smart redirects");
  await shot("link-smart");
  await open(`/links/${L.launch.id}`);
  await tab("Share");
  await page.getByLabel("Source", { exact: true }).fill("newsletter");
  await page.getByLabel("Medium", { exact: true }).fill("email");
  await page.getByLabel("Campaign", { exact: true }).fill("orbit-launch");
  await shot("link-share", { fullPage: true });
  await open(`/links/${L.launch.id}`);
  await tab("History");
  await shot("link-history");

  const last30 = () => page.getByText("30 days", { exact: true }).click();
  await open(`/stats/${L.launch.id}`);
  await last30();
  await shot("link-stats", { fullPage: true });
  await open(`/stats/${L.store.id}`);
  await last30();
  await shot("link-stats-targets", { fullPage: true });
  await open("/dashboard");
  await last30();
  await shot("dashboard", { fullPage: true });
  await open("/domains");
  await shot("domains");
  await open("/users");
  await shot("users");
  await open("/audit");
  await shot("audit");
  await open("/settings");
  await shot("settings");
  for (const [t, name] of [["Data", "settings-data"]]) {
    await tab(t);
    await shot(name);
  }
  await open("/api-help");
  await shot("api");

  // Public statistics page, signed out
  const pub = await browser.newContext(base);
  const pubPage = await pub.newPage();
  await pubPage.goto(`${APP}/s/${L.launch.id}`);
  await pubPage.waitForLoadState("networkidle");
  await pubPage.waitForTimeout(600);
  await pubPage.screenshot({ path: path.join(OUT, "public-stats.png"), fullPage: true });
  await pubPage.goto(`${APP}/login`);
  await pubPage.waitForLoadState("networkidle");
  await pubPage.screenshot({ path: path.join(OUT, "login.png") });
  await pub.close();

  // Dark theme and phone
  const dark = await browser.newContext({ ...base, colorScheme: "dark", storageState: await context.storageState() });
  const darkPage = await dark.newPage();
  await darkPage.goto(`${APP}/stats/${L.launch.id}`);
  await darkPage.waitForLoadState("networkidle");
  await darkPage.getByText("30 days", { exact: true }).click();
  await darkPage.waitForLoadState("networkidle");
  await darkPage.waitForTimeout(600);
  await darkPage.screenshot({ path: path.join(OUT, "dark.png") });
  await dark.close();

  const phone = await browser.newContext({ ...base, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, storageState: await context.storageState() });
  const phonePage = await phone.newPage();
  for (const [p, name] of [["/links", "phone-links"], [`/stats/${L.launch.id}`, "phone-stats"]]) {
    await phonePage.goto(`${APP}${p}`);
    await phonePage.waitForLoadState("networkidle");
    await phonePage.waitForTimeout(600);
    await phonePage.screenshot({ path: path.join(OUT, `${name}.png`) });
  }
  await phone.close();

  await browser.close();
} finally {
  server.kill("SIGTERM");
  proxy.close();
  rmSync(dataDir, { recursive: true, force: true });
}
