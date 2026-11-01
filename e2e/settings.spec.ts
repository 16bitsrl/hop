import { expect, test } from "@playwright/test";
import { APP } from "../playwright.config";
import { apiAs, createUser, getOutbox, loginAs, resetSettings } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetSettings(request);
});

test("email settings can be saved and tested", async ({ page, request }) => {
  const admin = await createUser(request, { role: "admin" });
  await loginAs(page, admin, "/settings");
  await page.getByRole("tab", { name: "Email" }).click();
  await page.getByLabel("Server", { exact: true }).fill("outbox.test");
  await page.getByLabel("From address").fill("hop@example.test");
  await page.getByRole("button", { name: "Save email settings" }).click();
  await expect(page.getByText("Saved")).toBeVisible();

  await page.getByLabel("Send test to").fill("probe@example.test");
  await page.getByRole("button", { name: "Send test email" }).click();
  await expect(page.getByText("Test email sent")).toBeVisible();
  const mails = await getOutbox(request);
  expect(mails.some((m) => m.to === "probe@example.test")).toBeTruthy();
});

test("password login can be turned off only when single sign-on is set up", async ({ page, request, playwright }) => {
  const admin = await createUser(request, { role: "admin" });
  const api = await apiAs(playwright, admin);
  // Refused without single sign-on.
  expect((await api.put("/api/settings/auth", { data: { passwordLogin: false } })).status()).toBe(400);

  await loginAs(page, admin, "/settings");
  await page.getByRole("switch", { name: "Allow signing in with a password" }).click();
  await expect(page.getByText("Set up single sign-on first.")).toBeVisible();

  // Set up single sign-on (nothing contacts it until someone signs in with it).
  const oidc = {
    enabled: true,
    discoveryUrl: "http://idp.localhost:9/.well-known/openid-configuration",
    clientId: "hop",
    clientSecret: "secret",
    label: "Company login",
    autoCreate: false,
    allowedDomains: [],
    defaultRole: "member",
  };
  expect((await api.put("/api/settings/oidc", { data: oidc })).ok()).toBeTruthy();
  await page.reload();
  await page.getByRole("switch", { name: "Allow signing in with a password" }).click();
  await expect(page.getByText("Saved")).toBeVisible();

  // The login page now shows only single sign-on and passkeys.
  await page.context().clearCookies();
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Company login" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with a passkey" })).toBeVisible();
  await expect(page.getByLabel("Password")).toHaveCount(0);
  // And the server refuses password sign-in.
  const res = await request.post("/api/auth/sign-in/email", {
    data: { email: admin.email, password: admin.password },
    headers: { origin: APP },
  });
  expect(res.status()).toBe(403);

  // Single sign-on cannot be removed while passwords are off.
  expect((await api.put("/api/settings/oidc", { data: { ...oidc, enabled: false } })).status()).toBe(400);

  // Back to normal for the following tests.
  await resetSettings(request);
  await api.dispose();
});
