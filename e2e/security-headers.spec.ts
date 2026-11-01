import { expect, test } from "@playwright/test";
import { SHORT } from "../playwright.config";
import { apiAs, createUser, loginAs } from "./helpers";
import { createLink, ensureDomain, uniq } from "./links-helpers";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

test("the app and its API forbid framing and sniffing, and restrict where content may load from", async ({ request }) => {
  for (const path of ["/", "/login", "/api/status"]) {
    const res = await request.get(path);
    const h = res.headers();
    expect(h["x-frame-options"], path).toBe("DENY");
    expect(h["x-content-type-options"], path).toBe("nosniff");
    expect(h["referrer-policy"], path).toBeTruthy();
    const csp = h["content-security-policy"] ?? "";
    expect(csp, path).toContain("frame-ancestors 'none'");
    expect(csp, path).toContain("default-src 'self'");
    expect(csp, path).toContain("object-src 'none'");
    expect(csp, path).toMatch(/img-src [^;]*https:/);
  }
});

test("the built-in visitor pages allow only their own nonce-marked style and script, and cannot be framed", async ({ request, playwright }) => {
  const admin = await apiAs(playwright, await createUser(request, { role: "admin" }));
  const domain = await ensureDomain(admin);
  const slug = uniq("hdr");
  await createLink(admin, { url: "https://example.com/x", slug: `${slug}-p`, password: "open-sesame", domainId: domain.id });
  await createLink(admin, { url: "https://example.com/x", slug: `${slug}-a`, domainId: domain.id, appUrl: "myapp://open" });

  const page = await request.get(`${SHORT}/${slug}-p`);
  const csp = page.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("default-src 'none'");
  const nonce = /style-src 'nonce-([^']+)'/.exec(csp)?.[1];
  expect(nonce).toBeTruthy();
  expect(await page.text()).toContain(`<style nonce="${nonce}">`);
  expect(page.headers()["x-frame-options"]).toBe("DENY");
  expect(page.headers()["x-content-type-options"]).toBe("nosniff");

  // A different nonce on every response.
  const again = await request.get(`${SHORT}/${slug}-p`);
  expect(/style-src 'nonce-([^']+)'/.exec(again.headers()["content-security-policy"] ?? "")?.[1]).not.toBe(nonce);

  const app = await request.get(`${SHORT}/${slug}-a`, { headers: { "user-agent": IPHONE_UA }, maxRedirects: 0 });
  const appCsp = app.headers()["content-security-policy"] ?? "";
  const scriptNonce = /script-src 'nonce-([^']+)'/.exec(appCsp)?.[1];
  expect(scriptNonce).toBeTruthy();
  expect(await app.text()).toContain(`<script nonce="${scriptNonce}">`);
  await admin.dispose();
});

test("the signed-in app runs without a single content security policy violation", async ({ page, request }) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
  });
  page.on("pageerror", (e) => violations.push(e.message));
  const user = await createUser(request, { role: "admin" });
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await loginAs(page, user, "/links");
  await expect(page.getByRole("heading", { name: "Links" })).toBeVisible();
  for (const path of ["/dashboard", "/domains", "/profile", "/settings", "/users", "/audit"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  expect(violations).toEqual([]);
});
