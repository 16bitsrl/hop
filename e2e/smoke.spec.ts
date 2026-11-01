import { expect, test } from "@playwright/test";
import { SHORT } from "../playwright.config";

test("app host serves the app and health check", async ({ page, request }) => {
  expect((await request.get("/healthz")).ok()).toBeTruthy();
  await page.goto("/");
  await expect(page).toHaveTitle(/hop/);
});

test("unknown slug on a short domain is a 404", async ({ request }) => {
  const res = await request.get(`${SHORT}/does-not-exist`, { maxRedirects: 0 });
  expect(res.status()).toBe(404);
});
