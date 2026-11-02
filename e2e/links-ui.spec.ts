import { expect, test, type Page } from "@playwright/test";
import { APP, SHORT } from "../playwright.config";
import { apiAs, choose, createUser, loginAs } from "./helpers";
import { createLink, DESKTOP_UA, ensureDomain, IPHONE_UA, uniq } from "./links-helpers";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function setup(request: import("@playwright/test").APIRequestContext, playwright: import("@playwright/test").PlaywrightWorkerArgs["playwright"], role: "admin" | "member" | "viewer" = "admin") {
  const admin = await apiAs(playwright, await createUser(request, { role: "admin" }));
  await ensureDomain(admin);
  const user = role === "admin" ? await createUser(request, { role: "admin" }) : await createUser(request, { role });
  return { admin, user, api: await apiAs(playwright, user) };
}

const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true }).click();
const follow = (request: import("@playwright/test").APIRequestContext, slug: string, headers: Record<string, string> = {}) =>
  request.get(`${SHORT}/${slug}`, { maxRedirects: 0, headers: { "user-agent": DESKTOP_UA, ...headers } });

test.describe("links UI", () => {
  test("the title is filled in even when the link is created right after pasting", async ({ page, request, playwright }) => {
    const { user } = await setup(request, playwright);
    await loginAs(page, user, "/links");
    await page.getByRole("button", { name: "New link" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Destination URL").fill(`${APP}/api/_test/page?${uniq("t")}`);
    // Submit with Enter: the form has no time to look the title up itself.
    await dialog.getByLabel("Destination URL").press("Enter");
    await expect(page).toHaveURL(/\/links\/[^/]+$/);
    await expect(page.getByRole("heading", { name: "Hop test page" })).toBeVisible();
  });

  test("create with custom and generated slug, duplicate error, edit destination", async ({ page, request, playwright }) => {
    const { user } = await setup(request, playwright);
    await loginAs(page, user, "/links");
    const slug = uniq("ui");

    await page.getByRole("button", { name: "New link" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Destination URL").fill("https://example.com/ui-custom");
    await dialog.getByLabel("Short link ending").fill(slug);
    await dialog.getByRole("button", { name: "Create link" }).click();
    await expect(page).toHaveURL(/\/links\/[^/]+$/);
    await expect(page.getByTestId("short-url")).toHaveText(`${SHORT}/${slug}`);
    expect((await follow(request, slug)).headers().location).toBe("https://example.com/ui-custom");

    // Duplicate ending.
    await page.goto("/links");
    await page.getByRole("button", { name: "New link" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Destination URL").fill("https://example.com/other");
    await dialog.getByLabel("Short link ending").fill(slug);
    await dialog.getByRole("button", { name: "Create link" }).click();
    await expect(dialog.getByRole("alert")).toContainText("already in use");

    // Generated ending.
    await dialog.getByLabel("Short link ending").fill("");
    await dialog.getByRole("button", { name: "Create link" }).click();
    await expect(page).toHaveURL(/\/links\/[^/]+$/);
    const generated = (await page.getByTestId("short-url").innerText()).split("/").pop()!;
    expect(generated).toMatch(/^[a-z0-9]{6}$/);
    expect((await follow(request, generated)).headers().location).toBe("https://example.com/other");

    // Edit the destination.
    await tab(page, "Edit");
    await page.getByLabel("Destination URL").fill("https://example.com/edited");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    expect((await follow(request, generated)).headers().location).toBe("https://example.com/edited");
  });

  test("the title is fetched from the destination while typing", async ({ page, request, playwright }) => {
    const { user } = await setup(request, playwright);
    await loginAs(page, user, "/links");
    await page.getByRole("button", { name: "New link" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Destination URL").fill(`${APP}/api/_test/page`);
    await dialog.getByLabel("Destination URL").blur();
    await expect(dialog.getByLabel("Title")).toHaveValue("Hop test page");
  });

  test("tags and folders can be set when creating a link", async ({ page, request, playwright }) => {
    const { user, api } = await setup(request, playwright);
    const key = uniq("tf");
    await api.post("/api/folders", { data: { name: `Folder ${key}` } });
    await loginAs(page, user, "/links");
    await page.getByRole("button", { name: "New link" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Destination URL").fill("https://example.com/tagged");
    await dialog.getByLabel("Short link ending").fill(key);
    await dialog.getByLabel("Tags").fill(`red-${key}`);
    await dialog.getByLabel("Tags").press("Enter");
    await expect(dialog.getByText(`red-${key}`)).toBeVisible();
    await choose(page, dialog.getByLabel("Folder"), `Folder ${key}`);
    await dialog.getByRole("button", { name: "Create link" }).click();
    await expect(page).toHaveURL(/\/links\/[^/]+$/);
    await expect(page.getByText(`red-${key}`)).toBeVisible();
    await expect(page.getByText(`Folder ${key}`)).toBeVisible();
  });

  test("member sees another member's link but cannot change it; admin can", async ({ page, request, playwright }) => {
    const { admin, api: alice } = await setup(request, playwright, "member");
    const bobUser = await createUser(request, { role: "member" });
    const mine = await createLink(alice, { url: "https://example.com/alice", title: "Alice link" });

    await loginAs(page, bobUser, "/links");
    await page.getByLabel("Search links").fill(mine.slug);
    const row = page.getByRole("row").filter({ hasText: mine.slug });
    await expect(row).toBeVisible();
    await expect(row.getByRole("button", { name: "Delete" })).toBeDisabled();
    await row.getByRole("link", { name: mine.slug }).click();
    await expect(page).toHaveURL(new RegExp(`/links/${mine.id}$`));
    await expect(page.getByRole("button", { name: "Delete" })).toBeDisabled();
    await tab(page, "Edit");
    await expect(page.getByText("Only the owner or an admin can change this link.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await expect(page.getByLabel("Destination URL")).toBeDisabled();
    await tab(page, "Smart redirects");
    await expect(page.getByRole("button", { name: "Add rule" })).toBeDisabled();
    // Bob's own API calls are refused too.
    const bob = await apiAs(playwright, bobUser);
    expect((await bob.patch(`/api/links/${mine.id}`, { data: { title: "x" } })).status()).toBe(403);
    expect((await bob.delete(`/api/links/${mine.id}`)).status()).toBe(403);

    // An admin can delete it from the UI.
    const adminUser = await createUser(request, { role: "admin" });
    await loginAs(page, adminUser, `/links/${mine.id}`);
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete link" }).click();
    await expect(page).toHaveURL(/\/links$/);
    expect((await admin.get(`/api/links/${mine.id}`)).status()).toBe(404);
  });

  test("viewer can browse but not create or change", async ({ page, request, playwright }) => {
    const { admin, user } = await setup(request, playwright, "viewer");
    const l = await createLink(admin, { url: "https://example.com/view" });
    await loginAs(page, user, "/links");
    await expect(page.getByRole("button", { name: "New link" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Import CSV" })).toHaveCount(0);
    await page.getByLabel("Search links").fill(l.slug);
    await expect(page.getByRole("row").filter({ hasText: l.slug })).toBeVisible();
    await page.goto(`/links/${l.id}`);
    await expect(page.getByRole("button", { name: "Delete" })).toBeDisabled();
    await tab(page, "Edit");
    await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  test("list: search, filters, sort, copy, bulk actions with skipped report", async ({ page, request, playwright }) => {
    const { admin, user, api } = await setup(request, playwright, "member");
    const key = uniq("lst");
    const a = await createLink(api, { slug: `${key}-a`, url: "https://example.com/a", tags: [`tag${key}`] });
    const b = await createLink(admin, { slug: `${key}-b`, url: "https://example.com/b" });
    const c = await createLink(api, { slug: `${key}-c`, url: "https://example.com/c", enabled: false });

    await loginAs(page, user, "/links");
    await page.getByLabel("Search links").fill(key);
    for (const l of [a, b, c]) await expect(page.getByRole("row").filter({ hasText: l.slug })).toBeVisible();

    await choose(page, page.getByLabel("Status"), "Disabled");
    await expect(page.getByRole("row").filter({ hasText: c.slug })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: a.slug })).toHaveCount(0);
    await choose(page, page.getByLabel("Status"), "Any status");
    await choose(page, page.getByLabel("Tag", { exact: true }), `tag${key}`);
    await expect(page.getByRole("row").filter({ hasText: a.slug })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: b.slug })).toHaveCount(0);
    await choose(page, page.getByLabel("Tag", { exact: true }), "All tags");

    await page.getByRole("row").filter({ hasText: a.slug }).getByRole("button", { name: "Copy short link" }).click();
    await expect(page.getByText("Copied")).toBeVisible();

    await choose(page, page.getByLabel("Sort by"), "Short link ending");
    const rows = page.getByRole("row").filter({ hasText: key });
    await expect(rows.first()).toContainText(`${key}-c`);
    await page.getByRole("button", { name: "Reverse order" }).click();
    await expect(rows.first()).toContainText(`${key}-a`);

    // Bulk: select a (mine) and b (admin's), add a tag. b is skipped.
    await page.getByRole("checkbox", { name: `Select ${a.slug}` }).check();
    await page.getByRole("checkbox", { name: `Select ${b.slug}` }).check();
    await page.getByRole("button", { name: "Add tag" }).click();
    await page.getByRole("dialog").getByLabel("Tag name").fill(`bulk${key}`);
    await page.getByRole("dialog").getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(/Updated 1 link/)).toBeVisible();
    await expect(page.getByText(/Skipped 1/)).toBeVisible();
    const tags = (await (await api.get(`/api/links/${a.id}`)).json()).link.tags.map((t: { name: string }) => t.name);
    expect(tags).toContain(`bulk${key}`);
  });

  test("folders can be created and deleted from the folders dialog", async ({ page, request, playwright }) => {
    const { user } = await setup(request, playwright);
    const name = uniq("Fold");
    await loginAs(page, user, "/links");
    await page.getByRole("button", { name: "Folders" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("New folder name").fill(name);
    await dialog.getByRole("button", { name: "Add folder" }).click();
    const item = dialog.getByRole("listitem").filter({ hasText: name });
    await expect(item).toBeVisible();
    await dialog.getByRole("button", { name: `Delete ${name}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete folder", exact: true }).click();
    await expect(item).toHaveCount(0);
  });

  test("password, enable switch and expiry from the UI", async ({ page, request, playwright }) => {
    const { user, api } = await setup(request, playwright);
    const l = await createLink(api, { url: "https://example.com/secret", fallbackUrl: "https://example.com/gone" });
    await loginAs(page, user, `/links/${l.id}`);

    await tab(page, "Edit");
    await page.getByLabel("Password", { exact: true }).fill("open-sesame");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    expect(await (await follow(request, l.slug)).text()).toContain('type="password"');
    await page.getByRole("button", { name: "Remove password" }).click();
    await expect(page.getByText("Password removed")).toBeVisible();
    expect((await follow(request, l.slug)).headers().location).toBe("https://example.com/secret");

    await tab(page, "Overview");
    await page.getByRole("switch", { name: "Link is active" }).click();
    await expect.poll(async () => (await follow(request, l.slug)).headers().location).toBe("https://example.com/gone");
    await page.getByRole("switch", { name: "Link is active" }).click();
    await expect.poll(async () => (await follow(request, l.slug)).headers().location).toBe("https://example.com/secret");

    await tab(page, "Edit");
    await page.getByLabel("Expires on").fill("2020-01-01T10:00");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    expect((await follow(request, l.slug)).headers().location).toBe("https://example.com/gone");
    // A link that was never visited: it works once, then the fallback takes over.
    const fresh = await createLink(api, { url: "https://example.com/secret", fallbackUrl: "https://example.com/gone" });
    await page.goto(`/links/${fresh.id}`);
    await tab(page, "Edit");
    await page.getByLabel("Maximum clicks").fill("1");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    expect((await follow(request, fresh.slug)).headers().location).toBe("https://example.com/secret");
    await expect.poll(async () => (await follow(request, fresh.slug)).headers().location).toBe("https://example.com/gone");
  });

  test("CSV import: upload, preview with a bad row, import, report", async ({ page, request, playwright }) => {
    const { user } = await setup(request, playwright);
    const key = uniq("imp");
    await loginAs(page, user, "/links");
    await page.getByRole("button", { name: "Import CSV" }).click();
    const dialog = page.getByRole("dialog");

    const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download template" }).click()]);
    expect(download.suggestedFilename()).toBe("hop-links-template.csv");

    const csv = `url,slug,title\nhttps://example.com/one,${key}-1,One\nnot-a-url,${key}-2,Broken\nhttps://example.com/three,${key}-3,Three\n`;
    await dialog.getByLabel("CSV file").setInputFiles({ name: "links.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await expect(dialog.getByText("2 ready to import")).toBeVisible();
    await expect(dialog.getByText("1 with problems")).toBeVisible();
    await expect(dialog.getByText("This is not a valid web address.")).toBeVisible();
    await dialog.getByRole("button", { name: "Import 2 links" }).click();
    await expect(dialog.getByText("2 links created")).toBeVisible();
    await expect(dialog.getByText("1 skipped")).toBeVisible();
    expect((await follow(request, `${key}-1`)).headers().location).toBe("https://example.com/one");
    expect((await follow(request, `${key}-2`)).status()).toBe(404);
  });

  test("CSV import of a long file runs in batches and ends with one report", async ({ page, request, playwright }) => {
    const { user } = await setup(request, playwright);
    const key = uniq("big");
    await loginAs(page, user, "/links");
    await page.getByRole("button", { name: "Import CSV" }).click();
    const dialog = page.getByRole("dialog");
    const lines = Array.from({ length: 60 }, (_, i) => `${i === 51 ? "not-a-url" : `https://example.com/${i}`},${key}-${i},"Title ${i}, with comma"`);
    const csv = `url,slug,title\n${lines.join("\n")}\n`;
    await dialog.getByLabel("CSV file").setInputFiles({ name: "big.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await expect(dialog.getByText("59 ready to import")).toBeVisible();
    await dialog.getByRole("button", { name: "Import 59 links" }).click();
    await expect(dialog.getByText("59 links created")).toBeVisible({ timeout: 60_000 });
    await expect(dialog.getByText("1 skipped")).toBeVisible();
    // Row 52 of the data is line 53 of the file (the header is line 1).
    await expect(dialog.getByText(/Line 53/)).toBeVisible();
    expect((await follow(request, `${key}-0`)).headers().location).toBe("https://example.com/0");
    expect((await follow(request, `${key}-59`)).headers().location).toBe("https://example.com/59");
  });

  test("smart redirects: rules and A/B variants saved from the UI and honoured", async ({ page, request, playwright }) => {
    const { user, api } = await setup(request, playwright);
    const l = await createLink(api, { url: "https://example.com/main" });
    await loginAs(page, user, `/links/${l.id}`);
    await tab(page, "Smart redirects");

    await page.getByRole("button", { name: "Add rule" }).click();
    await page.getByLabel("Rule 1 destination URL").fill("https://example.com/ios-ui");
    await page.getByRole("checkbox", { name: "Rule 1 iOS" }).check();
    await page.getByLabel("Rule 1 app link").fill("myapp://open");
    await page.getByRole("button", { name: "Save smart redirects" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    // iPhone with an app link gets the deep link page; desktop still goes to the main URL.
    const ios = await follow(request, l.slug, { "user-agent": IPHONE_UA });
    expect(ios.status()).toBe(200);
    expect(await ios.text()).toContain("myapp://open");
    expect((await follow(request, l.slug)).headers().location).toBe("https://example.com/main");

    await page.getByRole("button", { name: "Add variant" }).click();
    await expect(page.getByLabel("Variant 1 URL")).toHaveValue("https://example.com/main");
    await page.getByRole("button", { name: "Add variant" }).click();
    await page.getByLabel("Variant 2 URL").fill("https://example.com/second");
    await page.getByLabel("Variant 2 weight").fill("3");
    await expect(page.getByText("25%")).toBeVisible();
    await expect(page.getByText("75%")).toBeVisible();
    await page.getByRole("button", { name: "Save smart redirects" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) seen.add((await follow(request, l.slug)).headers().location!);
    expect([...seen].every((u) => ["https://example.com/main", "https://example.com/second"].includes(u))).toBe(true);
    expect(seen.has("https://example.com/second")).toBe(true);

    await page.reload();
    await tab(page, "Smart redirects");
    await expect(page.getByLabel("Rule 1 destination URL")).toHaveValue("https://example.com/ios-ui");
    await expect(page.getByLabel("Variant 2 weight")).toHaveValue("3");
  });

  test("share: UTM builder writes into the URL and reads existing parameters", async ({ page, request, playwright }) => {
    const { user, api } = await setup(request, playwright);
    const l = await createLink(api, { url: "https://example.com/p?utm_source=old&x=1" });
    await loginAs(page, user, `/links/${l.id}`);
    await tab(page, "Share");
    await expect(page.getByLabel("Source", { exact: true })).toHaveValue("old");
    await page.getByLabel("Source", { exact: true }).fill("newsletter");
    await page.getByLabel("Campaign", { exact: true }).fill("spring sale");
    await expect(page.getByTestId("utm-result")).toContainText("utm_source=newsletter");
    await page.getByRole("button", { name: "Apply to destination" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    const loc = (await follow(request, l.slug)).headers().location!;
    const u = new URL(loc);
    expect(u.searchParams.get("utm_source")).toBe("newsletter");
    expect(u.searchParams.get("utm_campaign")).toBe("spring sale");
    expect(u.searchParams.get("x")).toBe("1");
  });

  test("share: QR code downloads as SVG and PNG, with colors and a logo", async ({ page, request, playwright }) => {
    const { user, api } = await setup(request, playwright);
    const l = await createLink(api, { url: "https://example.com/qr" });
    await loginAs(page, user, `/links/${l.id}`);
    await tab(page, "Share");
    await page.getByLabel("Foreground color").fill("#123456");
    const [svgDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download SVG" }).click()]);
    expect(svgDownload.suggestedFilename()).toBe(`${l.slug}.svg`);
    const svg = (await (await import("node:fs/promises")).readFile((await svgDownload.path())!, "utf8"));
    expect(svg).toContain("<svg");
    expect(svg.toLowerCase()).toContain("#123456");

    await page.getByLabel("Logo").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
    const [withLogo] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download SVG" }).click()]);
    expect(await (await import("node:fs/promises")).readFile((await withLogo.path())!, "utf8")).toContain("<image");

    const [pngDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PNG" }).click()]);
    expect(pngDownload.suggestedFilename()).toBe(`${l.slug}.png`);
    const bytes = await (await import("node:fs/promises")).readFile((await pngDownload.path())!);
    expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  });

  test("share: social preview card saved, uploaded image served, crawlers get the markup", async ({ page, request, playwright }) => {
    const { user, api } = await setup(request, playwright);
    const l = await createLink(api, { url: "https://example.com/social" });
    await loginAs(page, user, `/links/${l.id}`);
    await tab(page, "Share");
    await page.getByLabel("Preview title").fill("A great page");
    await page.getByLabel("Preview description").fill("Worth a click");
    await page.getByLabel("Upload image").setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByLabel("Image address")).toHaveValue(/\/media\/[a-f0-9-]+\.png$/);
    await expect(page.getByTestId("social-card")).toContainText("A great page");
    await page.getByRole("button", { name: "Save preview" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    const crawler = await request.get(`${SHORT}/${l.slug}`, { maxRedirects: 0, headers: { "user-agent": "facebookexternalhit/1.1" } });
    expect(crawler.status()).toBe(200);
    const html = await crawler.text();
    expect(html).toContain('property="og:title"');
    expect(html).toContain("A great page");
    expect(html).toMatch(/\/media\/[a-f0-9-]+\.png/);
    expect((await follow(request, l.slug)).status()).toBe(302);
  });

  test("history shows who changed what", async ({ page, request, playwright }) => {
    const { user, api } = await setup(request, playwright);
    const l = await createLink(api, { url: "https://example.com/h", title: "First title" });
    await api.patch(`/api/links/${l.id}`, { data: { title: "Second title", notes: "remember" } });
    await loginAs(page, user, `/links/${l.id}`);
    await tab(page, "History");
    await expect(page.getByText("created this link")).toBeVisible();
    const entry = page.getByTestId("history-entry").first();
    await expect(entry).toContainText(user.name);
    await expect(entry).toContainText("Title");
    await expect(entry).toContainText("First title");
    await expect(entry).toContainText("Second title");
    await expect(entry).toContainText("Notes");
    await expect(entry).toContainText("remember");
  });

  test("statistics tab is wired", async ({ page, request, playwright }) => {
    const { user, api } = await setup(request, playwright);
    const l = await createLink(api, { url: "https://example.com/s" });
    await loginAs(page, user, `/links/${l.id}`);
    await tab(page, "Statistics");
    await expect(page.getByRole("tabpanel")).toBeVisible();
  });

  test("admin blocks a domain in Settings; creating a link to it is refused", async ({ page, request, playwright }) => {
    const { user } = await setup(request, playwright);
    const host = `${uniq("bad")}.example`;
    await loginAs(page, user, "/settings");
    await tab(page, "Links");
    await page.getByLabel("Domain to block").fill(`https://www.${host}/page`);
    await page.getByRole("button", { name: "Block domain" }).click();
    await expect(page.getByText(`www.${host}`, { exact: true })).toBeVisible();

    await page.goto("/links");
    await page.getByRole("button", { name: "New link" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Destination URL").fill(`https://deep.www.${host}/x`);
    await dialog.getByRole("button", { name: "Create link" }).click();
    await expect(dialog.getByRole("alert")).toContainText("blocked");

    await page.goto("/settings");
    await tab(page, "Links");
    await page.getByRole("button", { name: `Unblock www.${host}` }).click();
    await expect(page.getByText(`www.${host}`, { exact: true })).toHaveCount(0);
  });

  test("admin edits the slug generator in Settings", async ({ page, request, playwright }) => {
    const { user, api } = await setup(request, playwright);
    await loginAs(page, user, "/settings");
    await tab(page, "Links");
    await page.getByLabel("Ending length").fill("8");
    await page.getByLabel("Allowed characters").fill("mno");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    try {
      const l = await createLink(api, { url: "https://example.com/gen-ui" });
      expect(l.slug).toMatch(/^[mno]{8}$/);
    } finally {
      await api.put("/api/settings/slugs", { data: { length: 6, alphabet: "abcdefghijklmnopqrstuvwxyz0123456789" } });
    }
  });

  test("domains page: admin adds, edits and deletes; members only read", async ({ page, request, playwright }) => {
    const { admin, user } = await setup(request, playwright);
    const host = `${uniq("dom")}.localhost`;
    await loginAs(page, user, "/domains");
    await page.getByRole("button", { name: "Add domain" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Domain", { exact: true }).fill(`http://${host}`);
    await dialog.getByLabel("Home page redirect").fill("https://example.com/home");
    await dialog.getByLabel("Unknown link redirect").fill("https://example.com/missing");
    await dialog.getByRole("button", { name: "Add domain" }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await dialog.getByLabel("Domain", { exact: true }).fill(host);
    await dialog.getByRole("button", { name: "Add domain" }).click();
    const row = page.getByRole("row").filter({ hasText: host });
    await expect(row).toBeVisible();

    const port = new URL(SHORT).port;
    expect((await request.get(`http://${host}:${port}/`, { maxRedirects: 0 })).headers().location).toBe("https://example.com/home");
    expect((await request.get(`http://${host}:${port}/nope`, { maxRedirects: 0 })).headers().location).toBe("https://example.com/missing");

    await row.getByRole("button", { name: "Edit" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Home page redirect").fill("https://example.com/home2");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect.poll(async () => (await request.get(`http://${host}:${port}/`, { maxRedirects: 0 })).headers().location).toBe("https://example.com/home2");

    // A domain with links cannot be deleted.
    const domains = (await (await admin.get("/api/domains")).json()).domains as { id: string; host: string }[];
    const dom = domains.find((d) => d.host === host)!;
    const l = await createLink(admin, { domainId: dom.id, url: "https://example.com/in-domain" });
    await page.reload();
    await page.getByRole("row").filter({ hasText: host }).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete domain" }).click();
    await expect(page.getByText("still has links")).toBeVisible();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
    await admin.delete(`/api/links/${l.id}`);
    await page.getByRole("row").filter({ hasText: host }).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete domain" }).click();
    await expect(page.getByRole("row").filter({ hasText: host })).toHaveCount(0);

    const member = await createUser(request, { role: "member" });
    await loginAs(page, member, "/domains");
    await expect(page.getByRole("button", { name: "Add domain" })).toHaveCount(0);
    await expect(page.getByRole("row").filter({ hasText: "s.localhost" })).toBeVisible();
  });

  test("profile: a member picks a default domain used for new links", async ({ page, request, playwright }) => {
    const { admin, user, api } = await setup(request, playwright, "member");
    const host = `${uniq("pd")}.localhost`;
    const other = await ensureDomain(admin, host);
    await loginAs(page, user, "/profile");
    await choose(page, page.getByLabel("Default domain for new links"), host);
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    const l = await createLink(api, { url: "https://example.com/pd" });
    expect(l.domainId).toBe(other.id);
  });
});
