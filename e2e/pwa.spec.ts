import { expect, test } from "@playwright/test";
import { SHORT } from "../playwright.config";
import { createUser, loginAs } from "./helpers";

test.describe("web app manifest", () => {
  test("is served on the app host with icons and a share target", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBeTruthy();
    const manifest = await res.json();
    expect(manifest.name).toBe("hop");
    expect(manifest.display).toBe("standalone");
    expect(manifest.share_target).toMatchObject({ action: "/links", method: "GET" });
    expect(manifest.share_target.params.url).toBe("share");
    const purposes = manifest.icons.map((i: { purpose?: string }) => i.purpose ?? "any");
    expect(purposes).toContain("maskable");
    for (const icon of manifest.icons) expect((await request.get(icon.src)).ok(), icon.src).toBeTruthy();
  });

  test("is not served on a short domain", async ({ request }) => {
    for (const path of ["/manifest.webmanifest", "/sw.js", "/icon-192.png"]) {
      const res = await request.get(`${SHORT}${path}`, { maxRedirects: 0 });
      expect(res.headers()["content-type"] ?? "", path).not.toMatch(/manifest|javascript|image\/png/);
    }
  });
});

test.describe("service worker", () => {
  test.use({ serviceWorkers: "allow" });

  test("precaches the app shell only, never the API or media", async ({ page, request }) => {
    const user = await createUser(request, { role: "admin" });
    await loginAs(page, user, "/links");
    await expect(page.getByRole("heading", { name: "Links" })).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);
    // Reload so that the worker is in control, then make API calls it must not keep.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Links" })).toBeVisible();
    await page.evaluate(() => fetch("/api/me").then((r) => r.text()));
    const cached = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) urls.push(new URL(r.url).pathname);
      return urls;
    });
    expect(cached.length).toBeGreaterThan(0);
    expect(cached.filter((p) => /^\/(api|media|healthz|metrics)(\/|$)/.test(p))).toEqual([]);
  });
});

test.describe("share target and bookmarklet", () => {
  test("a shared link opens the create dialog with the address filled in", async ({ page, request }) => {
    const user = await createUser(request, { role: "member" });
    await loginAs(page, user, `/links?share=${encodeURIComponent("https://example.com/shared-page")}`);
    const dialog = page.getByRole("dialog", { name: "New link" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Destination")).toHaveValue("https://example.com/shared-page");
    // The address is cleaned from the bar so that a reload does not open the dialog again.
    await expect(page).toHaveURL(/\/links$/);
  });

  test("?url= from the bookmarklet works too", async ({ page, request }) => {
    const user = await createUser(request, { role: "member" });
    await loginAs(page, user, `/links?url=${encodeURIComponent("https://example.com/bookmarked")}`);
    await expect(page.getByRole("dialog", { name: "New link" }).getByLabel("Destination")).toHaveValue("https://example.com/bookmarked");
  });

  test("finds the address inside shared text", async ({ page, request }) => {
    const user = await createUser(request, { role: "member" });
    await loginAs(page, user, `/links?text=${encodeURIComponent("Look at this https://example.com/in-text now")}`);
    await expect(page.getByRole("dialog", { name: "New link" }).getByLabel("Destination")).toHaveValue("https://example.com/in-text");
  });

  test("shared before signing in: the dialog opens after the sign-in", async ({ page, request }) => {
    const user = await createUser(request, { role: "member" });
    await page.goto(`/links?share=${encodeURIComponent("https://example.com/later")}`);
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "New link" }).getByLabel("Destination")).toHaveValue("https://example.com/later");
  });

  test("the bookmarklet is shown on the API help page", async ({ page, request }) => {
    const user = await createUser(request, { role: "member" });
    await loginAs(page, user, "/api-help");
    await expect(page.getByRole("heading", { name: "Shorten from your browser" })).toBeVisible();
    await expect(page.getByText("javascript:", { exact: false })).toBeVisible();
  });
});
