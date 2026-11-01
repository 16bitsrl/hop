import { expect, test } from "@playwright/test";
import { APP } from "../playwright.config";
import { apiAs, createUser, enableTestSmtp, linkIn, loginAs, loginViaUi, resetSettings, waitForMail } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetSettings(request);
});

test("admin generates a reset link, the user sets a new password", async ({ page, request }) => {
  const admin = await createUser(request, { role: "admin" });
  const user = await createUser(request, { role: "member" });
  await loginAs(page, admin, "/users");
  await page.getByRole("row", { name: new RegExp(user.email) }).getByRole("button", { name: "Reset password" }).click();
  const dialog = page.getByRole("dialog");
  const link = await dialog.getByLabel("Reset link").inputValue();
  expect(link).toContain("/reset-password?token=");
  await dialog.getByRole("button", { name: "Done" }).click();

  await page.context().clearCookies();
  await page.goto(link);
  await page.getByLabel("New password").fill("brand-new-password-9");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await loginViaUi(page, { email: user.email, password: "brand-new-password-9" });
  await expect(page).toHaveURL(/\/links$/);
});

test("with email set up, the forgot password page sends a reset email", async ({ page, request, playwright }) => {
  const admin = await createUser(request, { role: "admin" });
  const user = await createUser(request, { role: "member" });
  const api = await apiAs(playwright, admin);
  await enableTestSmtp(api);
  await api.dispose();

  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await page.getByLabel("Email").fill(user.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("If an account exists for this email, we sent a link.")).toBeVisible();

  const mail = await waitForMail(request, user.email);
  await page.goto(linkIn(mail));
  await page.getByLabel("New password").fill("emailed-new-password-7");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await loginViaUi(page, { email: user.email, password: "emailed-new-password-7" });
  await expect(page).toHaveURL(/\/links$/);
});

test("without email, the forgot password page tells to ask an admin", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(page.getByText("Ask an administrator for a reset link.")).toBeVisible();
});

test("a user changes their own password from the profile", async ({ page, request }) => {
  const user = await createUser(request);
  await loginAs(page, user, "/profile");
  await page.getByLabel("Current password").fill(user.password);
  await page.getByLabel("New password").fill("changed-password-42");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await loginViaUi(page, { email: user.email, password: "changed-password-42" });
  await expect(page).toHaveURL(/\/links$/);
});

test("resetting a password signs out every other session of that person", async ({ page, browser, request, playwright }) => {
  const admin = await createUser(request, { role: "admin" });
  const victim = await createUser(request, { role: "member" });
  const old = await apiAs(playwright, victim);
  expect((await (await old.get("/api/me")).json()).user.id).toBe(victim.id);

  const adminApi = await apiAs(playwright, admin);
  const { url } = (await (await adminApi.post(`/api/users/${victim.id}/reset-link`)).json()) as { url: string };
  const ctx = await browser.newContext({ baseURL: APP });
  const fresh = await ctx.newPage();
  await fresh.goto(url);
  await fresh.getByLabel("New password").fill("after-the-reset-1");
  await fresh.getByRole("button", { name: "Save new password" }).click();
  await expect(fresh).toHaveURL(/\/login$/);

  // The session opened before the reset is gone.
  expect((await (await old.get("/api/me")).json()).user).toBeNull();
  await Promise.all([old.dispose(), adminApi.dispose(), ctx.close()]);
});
