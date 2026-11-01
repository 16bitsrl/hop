import { expect, test } from "@playwright/test";
import { OAuth2Server } from "oauth2-mock-server";
import { apiAs, createUser, loginAs, resetSettings } from "./helpers";

/** A local fake identity provider: the one thing we stand in for. */
let idp: OAuth2Server;
let issuer: string;

test.beforeAll(async () => {
  idp = new OAuth2Server();
  await idp.issuer.keys.generate("RS256");
  await idp.start(0, "localhost");
  issuer = idp.issuer.url!;
});

test.afterAll(async () => {
  await idp.stop();
});

test.beforeEach(async ({ request }) => {
  await resetSettings(request);
});

function oidcSettings(over: Record<string, unknown> = {}) {
  return {
    enabled: true,
    discoveryUrl: `${issuer}/.well-known/openid-configuration`,
    clientId: "hop-test",
    clientSecret: "hop-test-secret",
    label: "Acme login",
    autoCreate: true,
    allowedDomains: ["acme.test"],
    defaultRole: "viewer",
    ...over,
  };
}

function nextIdentity(email: string, name: string) {
  idp.service.once("beforeUserinfo", (userInfoResponse: { body: Record<string, unknown> }) => {
    userInfoResponse.body = { ...userInfoResponse.body, sub: email, email, email_verified: true, name };
  });
  idp.service.once("beforeTokenSigning", (token: { payload: Record<string, unknown> }) => {
    token.payload.sub = email;
    token.payload.email = email;
    token.payload.email_verified = true;
    token.payload.name = name;
  });
}

test("single sign-on creates an account automatically for an allowed domain", async ({ page, request, playwright }) => {
  const admin = await createUser(request, { role: "admin" });
  const api = await apiAs(playwright, admin);
  expect((await api.put("/api/settings/oidc", { data: oidcSettings() })).ok()).toBeTruthy();
  await api.dispose();

  nextIdentity("sso.person@acme.test", "Sso Person");
  await page.goto("/login");
  await page.getByRole("button", { name: "Acme login" }).click();
  await expect(page).toHaveURL(/\/links$/, { timeout: 20_000 });
  await expect(page.getByText("Sso Person").first()).toBeVisible();
  // Default role is viewer: no admin pages.
  await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
});

test("single sign-on refuses a domain that is not allowed", async ({ page, request, playwright }) => {
  const admin = await createUser(request, { role: "admin" });
  const api = await apiAs(playwright, admin);
  expect((await api.put("/api/settings/oidc", { data: oidcSettings() })).ok()).toBeTruthy();
  await api.dispose();

  nextIdentity("intruder@elsewhere.test", "Intruder");
  await page.goto("/login");
  await page.getByRole("button", { name: "Acme login" }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  await expect(page.getByText("This account is not allowed to sign in here.")).toBeVisible();
});

test("an invited person can continue with single sign-on", async ({ page, request, playwright }) => {
  const admin = await createUser(request, { role: "admin" });
  const api = await apiAs(playwright, admin);
  expect((await api.put("/api/settings/oidc", { data: oidcSettings({ autoCreate: false }) })).ok()).toBeTruthy();
  const invite = await (await api.post("/api/invites", { data: { email: "invited.sso@acme.test", role: "member" } })).json();
  await api.dispose();

  nextIdentity("invited.sso@acme.test", "Invited Sso");
  await page.goto(new URL(invite.url).pathname);
  await page.getByRole("button", { name: "Acme login" }).click();
  await expect(page).toHaveURL(/\/links$/, { timeout: 20_000 });
  await expect(page.getByText("Invited Sso").first()).toBeVisible();
});

test("without auto-create, an unknown person cannot sign in", async ({ page, request, playwright }) => {
  const admin = await createUser(request, { role: "admin" });
  const api = await apiAs(playwright, admin);
  expect((await api.put("/api/settings/oidc", { data: oidcSettings({ autoCreate: false }) })).ok()).toBeTruthy();
  await api.dispose();

  nextIdentity("stranger@acme.test", "Stranger");
  await page.goto("/login");
  await page.getByRole("button", { name: "Acme login" }).click();
  await expect(page.getByText("This account is not allowed to sign in here.")).toBeVisible({ timeout: 20_000 });
});

test("an existing user signs in through single sign-on with the same email", async ({ page, request, playwright }) => {
  const admin = await createUser(request, { role: "admin" });
  const existing = await createUser(request, { role: "member", email: "existing@acme.test" });
  const api = await apiAs(playwright, admin);
  expect((await api.put("/api/settings/oidc", { data: oidcSettings({ autoCreate: false }) })).ok()).toBeTruthy();
  await api.dispose();

  nextIdentity(existing.email, existing.name);
  await page.goto("/login");
  await page.getByRole("button", { name: "Acme login" }).click();
  await expect(page).toHaveURL(/\/links$/, { timeout: 20_000 });
  await loginAs(page, admin, "/settings"); // sanity: settings page opens and shows the redirect URL
  await expect(page.getByText("/api/auth/callback/oidc")).toBeVisible();
});
