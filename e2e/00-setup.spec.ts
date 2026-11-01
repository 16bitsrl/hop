import { expect, test } from "@playwright/test";

// Must run first: the database has no users yet.
test("first run asks for the first admin, then the app opens", async ({ page, request }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole("heading", { name: "Welcome to hop" })).toBeVisible();

  await page.getByLabel("Name").fill("First Admin");
  await page.getByLabel("Email").fill("first-admin@example.test");
  await page.getByLabel("Password").fill("a-long-first-password");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/links$/);
  await expect(page.getByRole("heading", { name: "Links" })).toBeVisible();

  // The setup page is closed once a user exists.
  const again = await request.post("/api/setup", {
    data: { name: "Other", email: "other@example.test", password: "another-password" },
  });
  expect(again.status()).toBe(409);
  await page.goto("/setup");
  await expect(page).not.toHaveURL(/\/setup$/);
});

test("signing out and in again works for the first admin", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email").fill("first-admin@example.test");
  await page.getByLabel("Password").fill("a-long-first-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/links$/);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
