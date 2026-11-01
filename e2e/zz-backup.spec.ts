// Runs last on purpose: the round trip wipes the test database and restores it.
import { expect, test, type APIRequestContext } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { APP } from "../playwright.config";
import { apiAs, createUser, loginViaUi } from "./helpers";
import { createLink, ensureDomain, SHORT_HOST, uniq } from "./links-helpers";
import { DAY, seedClicks } from "./stats-helpers";

const SETUP_TOKEN = "test-setup-token";
const setupHeaders = { "x-setup-token": SETUP_TOKEN };
const METRICS = { headers: { authorization: "Bearer test-metrics-token" } };
const gauges = async (request: APIRequestContext) => {
  const text = await (await request.get("/metrics", METRICS)).text();
  return text
    .split("\n")
    .filter((l) => /^hop_(links|links_enabled|clicks_total|users|domains)[ {]/.test(l))
    .sort()
    .join("\n");
};

type Line = { format?: string; version?: number; tables?: string[]; t?: string; r?: Record<string, unknown>; end?: boolean; counts?: Record<string, number> };
const parseNdjson = (text: string) => text.trim().split("\n").map((l) => JSON.parse(l) as Line);

test("the backup is NDJSON with every table, a footer with counts, and no sessions", async ({ request, playwright }) => {
  const admin = await createUser(request, { role: "admin" });
  const api = await apiAs(playwright, admin);

  const plain = await api.get("/api/data/backup");
  expect(plain.status()).toBe(200);
  expect(plain.headers()["content-disposition"]).toMatch(/hop-backup-\d{4}-\d{2}-\d{2}\.ndjson"/);
  const lines = parseNdjson(await plain.text());
  expect(lines[0]).toMatchObject({ format: "hop-backup", version: 1 });
  expect(lines[0]!.tables).toEqual(
    expect.arrayContaining(["domains", "user", "account", "passkey", "links", "tags", "folders", "link_tags", "clicks", "settings", "audit_log", "api_keys", "blocked_domains"]),
  );
  expect(lines[0]!.tables).not.toContain("session");
  expect(lines[0]!.tables).not.toContain("verification");
  const footer = lines.at(-1)!;
  expect(footer.end).toBe(true);
  const perTable: Record<string, number> = {};
  for (const l of lines.slice(1, -1)) perTable[l.t!] = (perTable[l.t!] ?? 0) + 1;
  expect(perTable).toEqual(footer.counts);
  expect(perTable.user).toBeGreaterThan(0);
  // Password hashes are in the backup (needed to restore the logins), sessions are not.
  expect(lines.some((l) => l.t === "account" && typeof l.r!.password === "string")).toBe(true);
  expect(lines.some((l) => l.t === "session")).toBe(false);

  const gz = await api.get("/api/data/backup?gzip=1");
  expect(gz.headers()["content-disposition"]).toContain(".ndjson.gz");
  const unzipped = gunzipSync(await gz.body()).toString("utf8");
  expect(parseNdjson(unzipped)[0]).toMatchObject({ format: "hop-backup" });
  await api.dispose();
});

test("restore is refused when the installation already has users", async ({ request }) => {
  await createUser(request, { role: "admin" });
  expect((await request.post("/api/restore/start", { headers: setupHeaders })).status()).toBe(409);
  expect((await request.post("/api/restore/rows", { data: { rows: [] }, headers: { "x-restore-token": "nope" } })).status()).toBe(401);
  expect((await request.post("/api/restore/finish", { data: { counts: {} } })).status()).toBe(401);
});

test("export, wipe, restore: links, clicks and logins come back", async ({ page, request, playwright }, testInfo) => {
  test.setTimeout(120_000);
  // Seed something recognisable.
  const admin = await createUser(request, { role: "admin", name: "Backup Admin" });
  const api = await apiAs(playwright, admin);
  const domain = await ensureDomain(api);
  const slug = uniq("bk");
  const link = await createLink(api, { url: "https://example.com/backup?q=è☕", slug, title: "Backup \"test\"", tags: ["round-trip"], domainId: domain.id });
  await seedClicks(request, link.id, [{ ts: Date.now() - 2 * DAY, count: 3, country: "IT", visitorHash: "aaaaaaaaaaaaaaaa" }, { ts: Date.now() - DAY, referrerHost: "t.co" }]);
  const { secret } = (await (await api.post("/api/api-keys", { data: { name: "survives" } })).json()) as { secret: string };

  const before = await gauges(request);
  expect(before).toMatch(/hop_clicks_total [1-9]/);
  const exported = await (await api.get("/api/data/backup?gzip=1")).body();
  const file = testInfo.outputPath("backup.ndjson.gz");
  writeFileSync(file, exported);

  expect((await request.post("/api/_test/wipe")).ok()).toBeTruthy();
  expect((await (await request.get("/api/app-config")).json()).setupRequired).toBe(true);
  expect(await gauges(request)).toMatch(/hop_links 0/);

  // Restore through the page offered on the first-run screen.
  await page.goto("/setup");
  await page.getByRole("link", { name: "Restore from a backup" }).click();
  await expect(page).toHaveURL(/\/restore/);
  await page.getByLabel("Backup file").setInputFiles(file);
  await page.getByLabel("Setup token").fill(SETUP_TOKEN);
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByTestId("restore-done")).toBeVisible({ timeout: 90_000 });

  expect(await gauges(request)).toBe(before);
  expect((await (await request.get("/api/app-config")).json()).setupRequired).toBe(false);

  // The same people sign in with the same passwords.
  await page.getByRole("link", { name: "Sign in" }).click();
  await loginViaUi(page, admin);
  await expect(page).toHaveURL(/\/links/);
  const restoredApi = await apiAs(playwright, admin);
  const found = ((await (await restoredApi.get(`/api/links?q=${slug}`)).json()) as { items: Record<string, any>[] }).items[0]!; // eslint-disable-line @typescript-eslint/no-explicit-any
  expect(found).toMatchObject({ id: link.id, url: "https://example.com/backup?q=è☕", title: 'Backup "test"', host: SHORT_HOST });
  expect(found.tags.map((t: { name: string }) => t.name)).toEqual(["round-trip"]);
  const clicks = (await (await request.get(`/api/_test/clicks?linkId=${link.id}`)).json()) as { country: string | null; referrerHost: string | null; visitorHash: string | null }[];
  expect(clicks).toHaveLength(4);
  expect(clicks[0]).toMatchObject({ country: "IT", visitorHash: "aaaaaaaaaaaaaaaa" });
  expect(clicks[3]).toMatchObject({ referrerHost: "t.co" });
  // API keys survive too, and the restore itself is in the audit log.
  const withKey = await playwright.request.newContext({ baseURL: new URL(page.url()).origin, extraHTTPHeaders: { authorization: `Bearer ${secret}` } });
  expect(((await (await withKey.get("/api/me")).json()) as { user: { id: string } }).user.id).toBe(admin.id);
  const audit = (await (await restoredApi.get("/api/audit?action=data.restore")).json()) as { items: unknown[] };
  expect(audit.items.length).toBeGreaterThan(0);
  await Promise.all([withKey.dispose(), restoredApi.dispose(), api.dispose()]);
});

test("a restore token does not outlive setup, restores cannot be hijacked, and one restore runs at a time", async ({ request }) => {
  expect((await request.post("/api/_test/wipe")).ok()).toBeTruthy();
  const userRow = (email: string) => ({ t: "user", r: { id: crypto.randomUUID(), name: "Evil", email, email_verified: 1, role: "admin", disabled: 0, created_at: 1, updated_at: 1 } });
  const setupRequired = async () => ((await (await request.get("/api/app-config")).json()) as { setupRequired: boolean }).setupRequired;

  // Starting needs the setup token when one is configured.
  expect((await request.post("/api/restore/start")).status()).toBe(403);
  expect((await request.post("/api/restore/start", { headers: { "x-setup-token": "wrong" } })).status()).toBe(403);
  const first = ((await (await request.post("/api/restore/start", { headers: setupHeaders })).json()) as { token: string }).token;
  // A second restore cannot break the running one.
  expect((await request.post("/api/restore/start", { headers: setupHeaders })).status()).toBe(409);

  // First-run setup needs the setup token too, and ends the pending restore.
  const body = { name: "Real Admin", email: "real-admin@example.test", password: "a-long-real-password" };
  expect((await request.post("/api/setup", { data: body })).status()).toBe(403);
  expect((await request.post("/api/setup", { data: { ...body, setupToken: SETUP_TOKEN } })).ok()).toBeTruthy();
  const late = await request.post("/api/restore/rows", { data: { rows: [userRow("evil@example.test")] }, headers: { "x-restore-token": first } });
  expect(late.status()).toBe(401);
  expect((await request.post("/api/restore/finish", { data: { counts: {} }, headers: { "x-restore-token": first } })).status()).toBe(401);
  expect(await setupRequired()).toBe(false);
  const evil = await request.post("/api/auth/sign-in/email", { data: { email: "evil@example.test", password: "x" }, headers: { origin: APP } });
  expect(evil.ok()).toBeFalsy();

  // A restore that has started loading data owns the installation: nobody can run setup in between.
  expect((await request.post("/api/_test/wipe")).ok()).toBeTruthy();
  const second = ((await (await request.post("/api/restore/start", { headers: setupHeaders })).json()) as { token: string }).token;
  const domainRow = { t: "domains", r: { id: "own1", host: "own.localhost", is_default: 0, created_at: 1 } };
  expect((await request.post("/api/restore/rows", { data: { rows: [domainRow] }, headers: { "x-restore-token": second } })).ok()).toBeTruthy();
  const blocked = await request.post("/api/setup", { data: { ...body, setupToken: SETUP_TOKEN } });
  expect(blocked.status()).toBe(409);
  expect(await blocked.json()).toMatchObject({ error: "restore_in_progress" });
  expect((await request.post("/api/restore/start", { headers: setupHeaders })).status()).toBe(409);
  expect(await setupRequired()).toBe(true);
});

test("a cut-off backup is reported, bad rows are refused, and the full data is put back at the end", async ({ request, playwright }) => {
  const admin = await createUser(request, { role: "admin" });
  const api = await apiAs(playwright, admin);
  const full = await (await api.get("/api/data/backup")).text();
  const before = await gauges(request);
  await api.dispose();

  expect((await request.post("/api/_test/wipe")).ok()).toBeTruthy();
  const start = async () => ({ "x-restore-token": ((await (await request.post("/api/restore/start", { headers: setupHeaders })).json()) as { token: string }).token });
  let headers = await start();
  const rows = [{ t: "domains", r: { id: "d1", host: "cut.localhost", is_default: 0, created_at: 1 } }];
  expect((await request.post("/api/restore/rows", { data: { rows }, headers })).ok()).toBeTruthy();
  // Unknown table or column names are refused.
  expect((await request.post("/api/restore/rows", { data: { rows: [{ t: "sqlite_master", r: { a: 1 } }] }, headers })).status()).toBe(400);
  expect((await request.post("/api/restore/rows", { data: { rows: [{ t: "domains", r: { "id) values (1); --": "x" } }] }, headers })).status()).toBe(400);
  // The footer says two domains but only one arrived.
  const finish = await request.post("/api/restore/finish", { data: { counts: { domains: 2 } }, headers });
  expect(finish.status()).toBe(409);
  expect(await finish.json()).toMatchObject({ error: "restore_incomplete", tables: ["domains"] });

  // Put everything back from the full backup.
  expect((await request.post("/api/_test/wipe")).ok()).toBeTruthy();
  headers = await start();
  const all = parseNdjson(full);
  const data = all.slice(1, -1);
  for (let i = 0; i < data.length; i += 400) {
    const res = await request.post("/api/restore/rows", { data: { rows: data.slice(i, i + 400) }, headers });
    expect(res.ok(), await res.text()).toBeTruthy();
  }
  expect((await request.post("/api/restore/finish", { data: { counts: all.at(-1)!.counts }, headers })).ok()).toBeTruthy();
  expect(await gauges(request)).toBe(before);
});
