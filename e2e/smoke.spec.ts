import { expect, test } from "@playwright/test";
import { APP, SHORT } from "../playwright.config";
import { createUser, loginAs } from "./helpers";

test("app host serves the app and health check", async ({ page, request }) => {
  expect((await request.get("/healthz")).ok()).toBeTruthy();
  await page.goto("/");
  await expect(page).toHaveTitle(new RegExp(new URL(APP).host));
});

test("unknown slug on a short domain is a 404", async ({ request }) => {
  const res = await request.get(`${SHORT}/does-not-exist`, { maxRedirects: 0 });
  expect(res.status()).toBe(404);
});

test("the browser tab names the current page and the instance", async ({ page, request }) => {
  const host = new URL(APP).host;
  await page.goto("/login");
  await expect(page).toHaveTitle(`Sign in · ${host}`);
  const admin = await createUser(request, { role: "admin" });
  await loginAs(page, admin, "/links");
  await expect(page).toHaveTitle(`Links · ${host}`);
  await page.getByRole("navigation").getByRole("link", { name: "Domains" }).first().click();
  await expect(page).toHaveTitle(`Domains · ${host}`);
});
