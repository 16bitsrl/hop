import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { APP, SHORT } from "../playwright.config";
import { buildCli, cli, goAvailable, standIn } from "./cli-helpers";
import { apiAs, createUser, loginAs, type TestUser } from "./helpers";
import { DESKTOP_UA, ensureDomain, uniq } from "./links-helpers";

/** The command line app (cli/), run as a real program against this server. */

test.skip(!goAvailable, "Go is needed to build the command line app");

const HOST = new URL(APP).host;
const SHORT_HOST = new URL(SHORT).host;

type Playwright = Parameters<Parameters<typeof test>[2]>[0]["playwright"];

/** A person with an API key, and the app already signed in with it. */
async function signedIn(playwright: Playwright, request: APIRequestContext, role: TestUser["role"] = "admin") {
  const user = await createUser(request, { role, name: `Cli ${role} ${uniq("")}` });
  const session = await apiAs(playwright, user);
  await ensureDomain(await adminSession(playwright, request));
  const { secret } = (await (await session.post("/api/api-keys", { data: { name: "cli test" } })).json()) as { secret: string };
  const hop = cli();
  const login = hop.run("login", APP, "--token", secret);
  expect(login.code, login.stderr).toBe(0);
  return { hop, user, session, secret };
}

let admin: APIRequestContext | undefined;
async function adminSession(playwright: Playwright, request: APIRequestContext) {
  admin ??= await apiAs(playwright, await createUser(request, { role: "admin" }));
  return admin;
}

test("signing in opens a page to confirm, then the app works as that person; signing out revokes the key", async ({ page, request }) => {
  const member = await createUser(request, { role: "member", name: "Terminal Person" });
  const hop = cli();

  // Nothing works before signing in, and the app says what to do.
  const before = hop.run("list");
  expect(before.code).toBe(1);
  expect(before.stderr).toContain("You are not signed in to any server");
  expect(before.stderr).toContain("hop login");

  const login = hop.start("login", APP, "--name", "hop CLI (e2e laptop)");
  const [, code] = await login.waitFor(/Your code\s+([A-Z2-9]{4}-[A-Z2-9]{4})/);
  const [url] = await login.waitFor(/http:\/\/\S+\/cli\/[A-Z2-9-]+/);
  expect(url).toBe(`${APP}/cli/${code}`);

  await loginAs(page, member, url);
  await expect(page.getByText("hop CLI (e2e laptop)")).toBeVisible();
  await expect(page.getByText(code!)).toBeVisible();
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByText("You can go back to your terminal")).toBeVisible();

  expect(await login.done, login.output()).toBe(0);
  expect(login.output()).toContain(`Signed in to ${HOST} as Terminal Person (member)`);

  const who = hop.run("whoami", "--json");
  expect(JSON.parse(who.stdout)).toMatchObject({ server: HOST, url: APP, user: { id: member.id, role: "member" } });
  expect(hop.run("servers").stdout).toContain(HOST);
  // The key is never printed and the settings file is private.
  expect(login.output()).not.toMatch(/hop_[A-Za-z0-9_-]{20,}/);

  await page.goto("/profile");
  const row = page.getByTestId("api-keys").getByRole("row", { name: /hop CLI \(e2e laptop\)/ });
  await expect(row).toContainText("Active");

  const out = hop.run("logout");
  expect(out.code, out.stderr).toBe(0);
  expect(out.stderr).toContain(`Signed out of ${HOST}`);
  await page.reload();
  await expect(page.getByTestId("api-keys").getByRole("row", { name: /hop CLI \(e2e laptop\)/ })).toContainText("Revoked");
  expect(hop.run("list").code).toBe(1);
});

test("refusing in the browser, a wrong key and a wrong address are explained", async ({ page, request }) => {
  const member = await createUser(request, { role: "member" });
  const hop = cli();
  const login = hop.start("login", APP);
  const [url] = await login.waitFor(/http:\/\/\S+\/cli\/[A-Z2-9-]+/);
  await loginAs(page, member, url);
  await page.getByRole("button", { name: "Cancel" }).click();
  expect(await login.done).toBe(1);
  expect(login.output()).toContain("The sign-in was refused in the browser");
  expect(hop.run("servers", "--json").stdout.trim()).toBe("[]");

  const badKey = hop.run("login", APP, "--token", "hop_notarealkey");
  expect(badKey.code).toBe(1);
  expect(badKey.stderr).toContain("did not accept this key");

  // A short domain is not the app.
  const shortDomain = hop.run("login", SHORT, "--token", "hop_x");
  expect(shortDomain.code).toBe(1);
  expect(shortDomain.stderr).toContain("doesn't look like a hop server");

  const nowhere = hop.run("login", "http://127.0.0.1:9", "--token", "hop_x");
  expect(nowhere.code).toBe(1);
  expect(nowhere.stderr).toContain("Could not reach 127.0.0.1:9");
});

test("a link's whole life from the terminal: create, find, change, switch off, QR code, statistics, delete", async ({ request, playwright }) => {
  const { hop, user, session } = await signedIn(playwright, request, "member");
  const slug = uniq("cli");

  // In a script the short link is the only thing on the standard output.
  const created = hop.run("create", "https://example.com/cli-page", "--slug", slug, "--title", "From the terminal", "--tag", "cli-a,cli-b", "--no-title-lookup");
  expect(created.code, created.stderr).toBe(0);
  expect(created.stdout.trim()).toBe(`${SHORT}/${slug}`);

  const shown = JSON.parse(hop.run("show", slug, "--json").stdout).link;
  expect(shown).toMatchObject({ slug, url: "https://example.com/cli-page", title: "From the terminal", ownerId: user.id });
  expect(shown.tags.map((t: { name: string }) => t.name)).toEqual(["cli-a", "cli-b"]);
  // The same link by its short address, with or without the scheme, and by id.
  for (const ref of [`${SHORT_HOST}/${slug}`, `${SHORT}/${slug}`, shown.id]) {
    expect(JSON.parse(hop.run("show", ref, "--json").stdout).link.id).toBe(shown.id);
  }
  const text = hop.run("show", slug);
  expect(text.stdout).toContain("https://example.com/cli-page");
  expect(text.stdout).toContain("From the terminal");

  // `hop <address>` is short for `hop create <address>`.
  const quick = hop.run("https://example.com/quick", "--no-title-lookup", "--json");
  expect(quick.code, quick.stderr).toBe(0);
  const quickLink = JSON.parse(quick.stdout).link;
  expect(quickLink.url).toBe("https://example.com/quick");

  const list = hop.run("list", "--search", slug);
  expect(list.stdout).toContain(`${SHORT}/${slug}`);
  expect(list.stdout).not.toContain(quickLink.slug);
  expect(JSON.parse(hop.run("list", "--tag", "cli-a", "--owner", "me", "--json").stdout).items.map((l: { slug: string }) => l.slug)).toContain(slug);

  const edited = hop.run("edit", slug, "--url", "https://example.com/changed", "--add-tag", "cli-c", "--remove-tag", "cli-a", "--expires", "7d", "--max-clicks", "100", "--password", "open-sesame", "--redirect", "301", "--json");
  expect(edited.code, edited.stderr).toBe(0);
  const after = JSON.parse(edited.stdout).link;
  expect(after).toMatchObject({ url: "https://example.com/changed", maxClicks: 100, hasPassword: true, redirectType: 301 });
  expect(after.tags.map((t: { name: string }) => t.name)).toEqual(["cli-b", "cli-c"]);
  const inDays = (new Date(after.expiresAt).getTime() - Date.now()) / 86_400_000;
  expect(inDays).toBeGreaterThan(6.9);
  expect(inDays).toBeLessThan(7.1);
  expect(hop.run("edit", slug, "--no-password", "--expires", "never", "--max-clicks", "0", "--redirect", "302").code).toBe(0);
  expect((await (await session.get(`/api/links/${shown.id}`)).json()).link).toMatchObject({ hasPassword: false, expiresAt: null, maxClicks: null });
  expect(hop.run("edit", slug).code).toBe(2); // nothing named: nothing guessed

  // Smart redirects and an A/B test.
  const smart = hop.run("edit", slug, "--rule", "device=ios country=it url=https://example.com/ios", "--variant", "70:https://example.com/a", "--variant", "30:https://example.com/b", "--json");
  expect(smart.code, smart.stderr).toBe(0);
  const smartLink = JSON.parse(smart.stdout).link;
  expect(smartLink.rules).toMatchObject([{ devices: ["ios"], countries: ["IT"], url: "https://example.com/ios" }]);
  expect(smartLink.variants.map((v: { weight: number }) => v.weight)).toEqual([70, 30]);
  expect(hop.run("edit", slug, "--variant", "https://example.com/only-one").code).toBe(2);
  expect(hop.run("edit", slug, "--no-rules", "--no-variants").code).toBe(0);

  // Off and on again.
  expect(hop.run("disable", slug).stderr).toContain("is off");
  expect((await request.get(`${SHORT}/${slug}`, { maxRedirects: 0 })).status()).toBe(404);
  expect(hop.run("enable", slug).stderr).toContain("is on");
  const hit = await request.get(`${SHORT}/${slug}`, { maxRedirects: 0, headers: { "user-agent": DESKTOP_UA } });
  expect(hit.status()).toBe(302);
  expect(hit.headers().location).toBe("https://example.com/changed");

  // The click shows up in the statistics.
  await expect.poll(() => JSON.parse(hop.run("stats", slug, "--json").stdout).totals.clicks, { timeout: 10_000 }).toBe(1);
  const stats = hop.run("stats", slug, "--period", "7d");
  expect(stats.code, stats.stderr).toBe(0);
  expect(stats.stdout).toContain(`${SHORT_HOST.split(":")[0]}/${slug}`);
  expect(stats.stdout).toMatch(/1\s+1\s/); // one click, one visitor
  expect(hop.run("stats", "--json").code).toBe(0);
  expect(hop.run("stats", slug, "--csv", "clicks").stdout).toContain("time,link,referrer_host");
  expect(hop.run("stats", slug, "--period", "soon").code).toBe(2);

  // QR code: in the terminal, as PNG and as SVG.
  const qr = hop.run("qr", slug);
  expect(qr.stdout).toMatch(/[█▀▄]/);
  expect(qr.stdout).toContain(`${SHORT}/${slug}`);
  const dir = mkdtempSync(path.join(tmpdir(), "hop-cli-qr-"));
  expect(hop.run("qr", slug, "-o", path.join(dir, "code.png"), "--size", "256").code).toBe(0);
  expect(readFileSync(path.join(dir, "code.png")).subarray(1, 4).toString()).toBe("PNG");
  expect(hop.run("qr", slug, "-o", path.join(dir, "code.svg"), "--color", "#0f7a5c").code).toBe(0);
  const svg = readFileSync(path.join(dir, "code.svg"), "utf8");
  expect(svg).toContain("<svg");
  expect(svg).toContain("#0f7a5c");
  expect(hop.run("qr", slug, "-o", path.join(dir, "code.gif")).code).toBe(2);

  expect(hop.run("history", slug).stdout).toMatch(/created|changed/);

  // Deleting asks first; without a terminal it needs --yes.
  const refused = hop.run("rm", slug);
  expect(refused.code).toBe(2);
  expect(refused.stderr).toContain("--yes");
  expect((await session.get(`/api/links/${shown.id}`)).status()).toBe(200);
  const removed = hop.run("rm", slug, quickLink.slug, "--yes");
  expect(removed.code, removed.stderr).toBe(0);
  expect((await session.get(`/api/links/${shown.id}`)).status()).toBe(404);
  const gone = hop.run("show", slug);
  expect(gone.code).toBe(1);
  expect(gone.stderr).toContain(`no link ending with “${slug}”`);
  await session.dispose();
});

test("problems from the server are explained in plain words", async ({ request, playwright }) => {
  const { hop, session } = await signedIn(playwright, request, "member");
  const slug = uniq("dup");
  expect(hop.run("create", "https://example.com/one", "--slug", slug, "--no-title-lookup").code).toBe(0);
  const taken = hop.run("create", "https://example.com/two", "--slug", slug, "--no-title-lookup");
  expect(taken.code).toBe(1);
  expect(taken.stderr).toContain("already in use");
  expect(hop.run("create", "not-an-address").stderr).toContain("not valid");
  expect(hop.run("create", "https://example.com/x", "--domain", "nope.example").stderr).toContain("no domain called “nope.example”");
  expect(hop.run("create", "https://example.com/x", "--expires", "someday").code).toBe(2);

  // A member cannot touch what only administrators manage.
  expect(hop.run("settings").stderr).toContain("Only administrators");
  expect(hop.run("domains", "add", "members.example").stderr).toContain("permission");

  const unknown = hop.run("frobnicate");
  expect(unknown.code).toBe(2);
  expect(unknown.stderr).toContain("Unknown command: frobnicate");
  expect(hop.run("list", "--frob").stderr).toContain("Unknown option: --frob");
  expect(hop.run("help").stdout).toContain("USAGE");
  expect(hop.run("version").stdout).toMatch(/^hop 0\.1\.0 \(/);
  await session.dispose();
});

test("the app speaks Italian on Italian systems, and a pasted key is never revoked by signing out", async ({ request, playwright }) => {
  const { hop, session, secret } = await signedIn(playwright, request, "member");
  const italian = hop.with({ HOP_LANG: "", LANG: "it_IT.UTF-8" });
  const overview = italian.run();
  expect(overview.stdout).toContain("Link brevi dal tuo terminale");
  expect(overview.stdout).toContain("Crea un link breve");
  expect(italian.run("show", "non-esiste").stderr).toContain("Non c'è nessun link che finisce con “non-esiste”");
  expect(italian.run("help", "create").stdout).toContain("OPZIONI");
  // The choice can be fixed, whatever the system says.
  expect(hop.run("config", "set", "language", "it").code).toBe(0);
  expect(hop.with({ HOP_LANG: "", LANG: "en_US.UTF-8" }).run("servers").stdout).toBeTruthy();
  expect(hop.with({ HOP_LANG: "", LANG: "en_US.UTF-8" }).run("list", "--frob").stderr).toContain("Opzione sconosciuta");
  expect(hop.run("config", "set", "language", "auto").code).toBe(0);

  // The key was created by the person and pasted with --token: signing out forgets it, nothing more.
  const out = hop.run("logout");
  expect(out.code, out.stderr).toBe(0);
  expect(out.stderr).toContain("still works elsewhere");
  const withKey = await playwright.request.newContext({ baseURL: APP, extraHTTPHeaders: { authorization: `Bearer ${secret}` } });
  expect((await withKey.get("/api/links")).status()).toBe(200);
  await Promise.all([withKey.dispose(), session.dispose()]);
});

test("the skill for AI agents is written where they look for it and follows the installed version", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "hop-cli-home-"));
  const hop = cli({ env: { HOME: home, USERPROFILE: home } });
  const doc = hop.run("skill", "--print").stdout;
  expect(doc).toMatch(/^---\nname: hop\n/);
  expect(doc).toContain("hop create");

  const one = hop.run("skill");
  expect(one.code, one.stderr).toBe(0);
  const claude = path.join(home, ".claude", "skills", "hop", "SKILL.md");
  expect(readFileSync(claude, "utf8")).toBe(doc);
  expect(hop.run("skill", "--all").code).toBe(0);
  const codex = path.join(home, ".codex", "skills", "hop", "SKILL.md");
  expect(readFileSync(codex, "utf8")).toBe(doc);
  expect(hop.run("skill", "--target", "../elsewhere").code).toBe(2);

  // A copy left by an older version is brought up to date by any command.
  writeFileSync(claude, doc.replace("hop create", "hop make"));
  // A file that is not this app's skill is never touched, nor is anything when the person opted out.
  writeFileSync(codex, "---\nname: something-else\n---\nmine\n");
  expect(hop.with({ HOP_NO_SKILL_AUTOUPDATE: "1" }).run("version").code).toBe(0);
  expect(readFileSync(claude, "utf8")).toContain("hop make");
  expect(hop.run("version").code).toBe(0);
  expect(readFileSync(claude, "utf8")).toBe(doc);
  expect(readFileSync(codex, "utf8")).toContain("something-else");
});

test("tags, folders, domains, blocked websites, settings and profile", async ({ request, playwright }) => {
  const { hop, session } = await signedIn(playwright, request, "admin");

  const tag = uniq("tag");
  expect(hop.run("tags", "add", tag, "--color", "#3b82f6").code).toBe(0);
  expect(hop.run("tags").stdout).toContain(tag);
  expect(hop.run("tags", "edit", tag, "--name", `${tag}-new`).code).toBe(0);
  expect(hop.run("tags", "rm", `${tag}-new`, "--yes").code).toBe(0);
  expect(hop.run("tags").stdout).not.toContain(tag);

  const folder = uniq("Folder");
  expect(hop.run("folders", "add", folder).code).toBe(0);
  expect(hop.run("folders", "add", "Inner", "--in", folder).code).toBe(0);
  expect(hop.run("folders").stdout).toContain(`${folder}/Inner`);
  const slug = uniq("fold");
  expect(hop.run("create", "https://example.com/in-folder", "--slug", slug, "--folder", `${folder}/Inner`, "--no-title-lookup").code).toBe(0);
  expect(JSON.parse(hop.run("list", "--folder", folder, "--json").stdout).items.map((l: { slug: string }) => l.slug)).toEqual([slug]);
  expect(hop.run("show", slug).stdout).toContain(`${folder}/Inner`);
  expect(hop.run("folders", "rm", `${folder}/Inner`, "--yes").code).toBe(0);
  expect(hop.run("folders", "rm", folder, "--yes").code).toBe(0);

  const domain = `${uniq("d")}.example`;
  expect(hop.run("domains", "add", domain, "--not-found-url", "https://example.com/404").code).toBe(0);
  expect(hop.run("domains").stdout).toContain(domain);
  expect(hop.run("domains", "edit", domain, "--root-url", "https://example.com/").code).toBe(0);
  const domains = (await (await session.get("/api/domains")).json()).domains as { host: string; rootUrl: string }[];
  expect(domains.find((d) => d.host === domain)).toMatchObject({ rootUrl: "https://example.com/", notFoundUrl: "https://example.com/404" });
  expect(hop.run("domains", "rm", domain, "--yes").code).toBe(0);

  const blocked = `${uniq("bad")}.example`;
  expect(hop.run("blocked", "add", blocked, "--reason", "spam").code).toBe(0);
  expect(hop.run("blocked").stdout).toContain(blocked);
  expect(hop.run("create", `https://${blocked}/x`, "--no-title-lookup").stderr).toContain("blocked");
  expect(hop.run("blocked", "rm", blocked).code).toBe(0);

  const shown = hop.run("settings");
  expect(shown.code, shown.stderr).toBe(0);
  for (const name of ["endings.length", "endings.alphabet", "stats.keep", "check.enabled", "check.every"]) expect(shown.stdout).toContain(name);
  expect(hop.run("settings", "set", "endings.length", "9").code).toBe(0);
  expect(hop.run("settings", "set", "stats.keep", "400").code).toBe(0);
  expect(hop.run("settings", "set", "check.every", "14").code).toBe(0);
  expect(hop.run("settings", "set", "check.enabled", "off").code).toBe(0);
  const settings = JSON.parse(hop.run("settings", "--json").stdout);
  expect(settings).toMatchObject({ endings: { length: 9 }, stats: { retentionDays: 400 }, check: { enabled: false, recheckDays: 14 } });
  expect(hop.run("settings", "set", "endings.length", "2").code).toBe(2);
  expect(hop.run("settings", "set", "nope", "1").code).toBe(2);
  // Back to how the other tests expect them.
  hop.run("settings", "set", "endings.length", "6");
  hop.run("settings", "set", "stats.keep", "forever");
  hop.run("settings", "set", "check.every", "7");
  hop.run("settings", "set", "check.enabled", "on");

  expect(hop.run("profile", "set", "name", "Renamed In Terminal").code).toBe(0);
  expect(JSON.parse(hop.run("whoami", "--json").stdout).user.name).toBe("Renamed In Terminal");
  expect(hop.run("profile").stdout).toContain("Renamed In Terminal");
  expect(hop.run("users").stdout).toContain("Renamed In Terminal");
  expect(hop.run("activity", "--type", "domain").stdout).toContain("domain.create");
  expect(JSON.parse(hop.run("api", "/api/status").stdout)).toMatchObject({ ok: true });
  expect(JSON.parse(hop.run("api", "tags", "-d", JSON.stringify({ name: uniq("apitag") })).stdout).tag.id).toBeTruthy();
  await session.dispose();
});

test("importing and exporting links with CSV files", async ({ request, playwright }) => {
  const { hop } = await signedIn(playwright, request, "member");
  const dir = mkdtempSync(path.join(tmpdir(), "hop-cli-csv-"));
  expect(hop.run("import", "--template").stdout).toMatch(/^url,slug,title/);

  const a = uniq("imp");
  const b = uniq("imp");
  const file = path.join(dir, "links.csv");
  writeFileSync(file, `url,slug,title,tags\nhttps://example.com/a,${a},First,"x;y"\nnot-a-link,${uniq("bad")},Broken,\nhttps://example.com/b,${b},Second,\n`);

  const dry = hop.run("import", file, "--dry-run");
  expect(dry.code, dry.stderr).toBe(0);
  expect(dry.stderr).toContain("Line 3");
  expect(dry.stderr).toContain("2 links are ready to be created, 1 rows have problems");
  expect(hop.run("show", a).code).toBe(1);

  const done = hop.run("import", file);
  expect(done.code, done.stderr).toBe(0);
  expect(done.stderr).toContain("2 links created, 1 rows skipped");
  expect(JSON.parse(hop.run("show", a, "--json").stdout).link).toMatchObject({ url: "https://example.com/a", title: "First" });

  const out = path.join(dir, "export.csv");
  expect(hop.run("export", "-o", out).code).toBe(0);
  const exported = readFileSync(out, "utf8");
  expect(exported).toMatch(/^url,slug,title,tags,folder,notes,domain/);
  expect(exported).toContain(`https://example.com/a,${a},First,x;y`);
  expect(exported).toContain(`https://example.com/b,${b},Second`);
  expect(hop.run("export").stdout).toContain(`,${b},`);
});

test("several servers: one is the default, any can be picked for one command", async ({ request, playwright }) => {
  const { hop, user, secret } = await signedIn(playwright, request, "member");
  const other = await standIn("hop", "Someone Else");
  const otherHost = `127.0.0.1:${other.port}`;
  try {
    const login = hop.run("login", `http://${otherHost}`, "--token", "hop_fake");
    expect(login.code, login.stderr).toBe(0);
    expect(login.stderr).toContain("It is now the default server");

    const servers = JSON.parse(hop.run("servers", "--json").stdout) as { name: string; default: boolean; user: string }[];
    expect(servers.map((s) => [s.name, s.default])).toEqual([[otherHost, true], [HOST, false]].sort());
    expect(JSON.parse(hop.run("whoami", "--json").stdout).user.name).toBe("Someone Else");

    // One command on the other server, by a part of its name; the default does not change.
    expect(JSON.parse(hop.run("whoami", "--json", "--server", "app.local").stdout).user.id).toBe(user.id);
    expect(JSON.parse(hop.with({ HOP_SERVER: HOST }).run("whoami", "--json").stdout).user.id).toBe(user.id);
    expect(JSON.parse(hop.run("whoami", "--json").stdout).user.name).toBe("Someone Else");

    expect(hop.run("use", "app.localhost").stderr).toContain(`default server is now ${HOST}`);
    expect(JSON.parse(hop.run("whoami", "--json").stdout).user.id).toBe(user.id);
    expect(hop.run("use", "nowhere.example").code).toBe(1);

    const out = hop.run("logout", otherHost);
    expect(out.code, out.stderr).toBe(0);
    expect(JSON.parse(hop.run("servers", "--json").stdout).map((s: { name: string }) => s.name)).toEqual([HOST]);

    // Scripts and CI: no sign-in at all, only two variables.
    const ci = cli({ env: { HOP_SERVER: APP, HOP_TOKEN: secret } });
    expect(JSON.parse(ci.run("whoami", "--json").stdout).user.id).toBe(user.id);
    expect(ci.run("servers", "--json").stdout.trim()).toBe("[]");
  } finally {
    other.stop();
  }
});

test("the app updates itself from a published release, after checking the download", async () => {
  test.skip(process.platform === "win32", "the release is packed with tar here");
  const dir = mkdtempSync(path.join(tmpdir(), "hop-cli-update-"));
  const installed = path.join(dir, "hop");
  copyFileSync(buildCli("0.1.0"), installed);

  // A release 9.9.9 packed like the real ones.
  const releaseDir = mkdtempSync(path.join(tmpdir(), "hop-cli-release-"));
  copyFileSync(buildCli("9.9.9"), path.join(releaseDir, "hop"));
  const goos = execFileSync("go", ["env", "GOOS"]).toString().trim();
  const goarch = execFileSync("go", ["env", "GOARCH"]).toString().trim();
  const asset = `hop_${goos}_${goarch}.tar.gz`;
  execFileSync("tar", ["-czf", asset, "hop"], { cwd: releaseDir });
  const archive = readFileSync(path.join(releaseDir, asset));
  const good = `${createHash("sha256").update(archive).digest("hex")}  ${asset}\n`;
  writeFileSync(path.join(releaseDir, "checksums.txt"), good);
  const assets = [
    { name: asset, browser_download_url: `{{base}}/${asset}` },
    { name: "checksums.txt", browser_download_url: "{{base}}/checksums.txt" },
  ];
  writeFileSync(
    path.join(releaseDir, "releases.json"),
    JSON.stringify([
      { tag_name: "v50.0.0", assets }, // a release of something else in the same repository
      { tag_name: "cli-v9.9.9", assets },
      { tag_name: "cli-v10.0.0", prerelease: true, assets },
      { tag_name: "cli-v0.0.9", assets },
    ]),
  );
  const server = await standIn("files", releaseDir);
  try {
    const hop = cli({ bin: installed, env: { HOP_UPDATE_API: `http://127.0.0.1:${server.port}/releases.json` } });
    expect(hop.run("version").stdout).toContain("hop 0.1.0");

    const check = hop.run("update", "--check");
    expect(check.code, check.stderr).toBe(0);
    expect(check.stderr).toContain("hop 9.9.9 is available (you have 0.1.0)");
    expect(hop.run("version").stdout).toContain("hop 0.1.0");
    expect(JSON.parse(hop.run("update", "--json").stdout)).toEqual({ current: "0.1.0", latest: "9.9.9", updateAvailable: true });

    // A download that does not match the published checksum is refused.
    writeFileSync(path.join(releaseDir, "checksums.txt"), `${"0".repeat(64)}  ${asset}\n`);
    const tampered = hop.run("update");
    expect(tampered.code).toBe(1);
    expect(tampered.stderr).toContain("could not be installed");
    expect(hop.run("version").stdout).toContain("hop 0.1.0");
    writeFileSync(path.join(releaseDir, "checksums.txt"), good);

    const update = hop.run("update");
    expect(update.code, update.stderr).toBe(0);
    expect(update.stderr).toContain("hop is now at version 9.9.9 (it was 0.1.0)");
    expect(hop.run("version").stdout).toContain("hop 9.9.9");
    expect(hop.run("update").stderr).toContain("hop is up to date (9.9.9)");

    expect(hop.run("config", "set", "updates", "auto").code).toBe(0);
    expect(JSON.parse(hop.run("config", "--json").stdout)).toMatchObject({ updates: "auto" });
    expect(hop.run("config", "set", "updates", "sometimes").code).toBe(2);
  } finally {
    server.stop();
  }
});

test("the one-line installers download the release for this system, check it and install it", async () => {
  test.skip(process.platform === "win32", "the release is built with a shell script here");
  test.setTimeout(300_000);
  // The real release build: every system, with checksums.
  const releaseDir = mkdtempSync(path.join(tmpdir(), "hop-cli-release-"));
  execFileSync("cli/scripts/build-release.sh", ["9.9.9", releaseDir], { stdio: "inherit" });
  writeFileSync(path.join(releaseDir, "releases.json"), JSON.stringify([{ tag_name: "v50.0.0" }, { tag_name: "cli-v10.0.0-rc1", prerelease: true }, { tag_name: "cli-v9.9.9" }], null, 2));
  const server = await standIn("files", releaseDir);
  const base = `http://127.0.0.1:${server.port}`;
  const env = { ...process.env, HOP_UPDATE_API: `${base}/releases.json`, HOP_DOWNLOAD_BASE: base, LANG: "en_US.UTF-8", LC_ALL: "" };
  try {
    const dir = mkdtempSync(path.join(tmpdir(), "hop-cli-install-"));
    const out = execFileSync("sh", ["cli/install.sh"], { env: { ...env, HOP_INSTALL_DIR: dir }, encoding: "utf8" });
    expect(out).toContain("hop 9.9.9 is installed");
    expect(out).toContain("is not in your PATH yet");
    expect(execFileSync(path.join(dir, "hop"), ["version"], { encoding: "utf8" })).toContain("hop 9.9.9");

    // In Italian for Italian systems, and a named version instead of the latest.
    const italian = execFileSync("sh", ["cli/install.sh"], { env: { ...env, HOP_INSTALL_DIR: dir, LANG: "it_IT.UTF-8", HOP_VERSION: "v9.9.9", HOP_UPDATE_API: `${base}/missing` }, encoding: "utf8" });
    expect(italian).toContain("hop 9.9.9 è installato");

    // A download that was tampered with is refused and nothing is installed.
    const good = readFileSync(path.join(releaseDir, "checksums.txt"), "utf8");
    writeFileSync(path.join(releaseDir, "checksums.txt"), good.replace(/^[0-9a-f]{64}/gm, "0".repeat(64)));
    const empty = mkdtempSync(path.join(tmpdir(), "hop-cli-install-"));
    expect(() => execFileSync("sh", ["cli/install.sh"], { env: { ...env, HOP_INSTALL_DIR: empty }, encoding: "utf8", stdio: "pipe" })).toThrow(/does not match its checksum/);
    expect(() => readFileSync(path.join(empty, "hop"))).toThrow();
    writeFileSync(path.join(releaseDir, "checksums.txt"), good);

    // The Windows installer, when PowerShell is here to run it.
    if (spawnSync("pwsh", ["-v"]).status === 0) {
      const winDir = mkdtempSync(path.join(tmpdir(), "hop-cli-install-win-"));
      const ps = spawnSync("pwsh", ["-NoProfile", "-File", "cli/install.ps1"], { env: { ...env, HOP_INSTALL_DIR: winDir, LOCALAPPDATA: winDir }, encoding: "utf8" });
      expect(ps.status, ps.stderr + ps.stdout).toBe(0);
      expect(ps.stdout).toContain("hop 9.9.9 is installed");
      expect(readFileSync(path.join(winDir, "hop.exe")).subarray(0, 2).toString()).toBe("MZ"); // a Windows program
    }
  } finally {
    server.stop();
  }
});
