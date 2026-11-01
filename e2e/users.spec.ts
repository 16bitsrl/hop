import { expect, test } from "@playwright/test";
import { APP } from "../playwright.config";
import { apiAs, createUser, enableTestSmtp, linkIn, loginAs, loginViaUi, resetSettings, waitForMail } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetSettings(request);
});

test("member and viewer cannot open admin pages or admin APIs", async ({ page, request, playwright }) => {
  for (const role of ["member", "viewer"] as const) {
    const user = await createUser(request, { role });
    await loginAs(page, user);
    await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Activity log" })).toHaveCount(0);
    for (const path of ["/users", "/settings", "/audit"]) {
      await page.goto(path);
      await expect(page.getByText("You don't have access to this page.")).toBeVisible();
    }
    const api = await apiAs(playwright, user);
    for (const path of ["/api/users", "/api/invites", "/api/settings", "/api/audit"]) {
      expect((await api.get(path)).status(), path).toBe(403);
    }
    expect((await api.put("/api/settings/auth", { data: { passwordLogin: true } })).status()).toBe(403);
    expect((await api.patch("/api/users/x", { data: { role: "admin" } })).status()).toBe(403);
    // Everyone signed in can read the directory of names.
    expect((await api.get("/api/users/directory")).status()).toBe(200);
    await api.dispose();
    await page.context().clearCookies();
  }
});

test("admin invites someone without email: copy the link, they set a password", async ({ page, request }) => {
  const admin = await createUser(request, { role: "admin" });
  await loginAs(page, admin, "/users");
  await page.getByRole("button", { name: "Invite user" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill("new.person@example.test");
  await dialog.getByLabel("Role").selectOption("viewer");
  await dialog.getByRole("button", { name: "Create invitation" }).click();
  await expect(dialog.getByText("Email is not set up, so send this link yourself.")).toBeVisible();
  const link = await dialog.getByLabel("Invitation link").inputValue();
  expect(link).toContain("/invite/");
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("new.person@example.test")).toBeVisible();

  await page.context().clearCookies();
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Join hop" })).toBeVisible();
  await expect(page.getByText("new.person@example.test")).toBeVisible();
  await page.getByLabel("Name").fill("New Person");
  await page.getByLabel("Password").fill("my-new-password-1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/links$/);
  await expect(page.getByText("New Person")).toBeVisible();

  // The link works once.
  await page.context().clearCookies();
  await page.goto(link);
  await expect(page.getByText("This invitation is not valid anymore.")).toBeVisible();
});

test("invitation by email arrives in the inbox and can be revoked", async ({ page, request, playwright }) => {
  const admin = await createUser(request, { role: "admin" });
  const api = await apiAs(playwright, admin);
  await enableTestSmtp(api);
  await loginAs(page, admin, "/users");
  await page.getByRole("button", { name: "Invite user" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill("mailed@example.test");
  await dialog.getByRole("button", { name: "Create invitation" }).click();
  await expect(dialog.getByText("We sent the invitation by email.")).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();

  const mail = await waitForMail(request, "mailed@example.test");
  const link = linkIn(mail);
  expect(link).toContain("/invite/");

  const row = page.getByRole("row", { name: /mailed@example.test/ });
  await row.getByRole("button", { name: "Revoke" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByRole("row", { name: /mailed@example.test/ })).toHaveCount(0);

  await page.context().clearCookies();
  await page.goto(link);
  await expect(page.getByText("This invitation is not valid anymore.")).toBeVisible();
  await api.dispose();
});

test("admin changes a role", async ({ page, request, playwright }) => {
  const admin = await createUser(request, { role: "admin" });
  const member = await createUser(request, { role: "member" });
  await loginAs(page, admin, "/users");
  await page.getByLabel(`Role for ${member.email}`).selectOption("viewer");
  await expect(page.getByText("Role updated")).toBeVisible();
  const api = await apiAs(playwright, admin);
  const { users } = await (await api.get("/api/users")).json();
  expect(users.find((u: { id: string }) => u.id === member.id).role).toBe("viewer");
  // An admin cannot change their own role.
  await expect(page.getByLabel(`Role for ${admin.email}`)).toBeDisabled();
  await api.dispose();
});

test("a disabled user cannot sign in and loses the session", async ({ page, browser, request }) => {
  const admin = await createUser(request, { role: "admin" });
  const victim = await createUser(request, { role: "member" });
  const victimCtx = await browser.newContext({ baseURL: APP });
  const victimPage = await victimCtx.newPage();
  await loginAs(victimPage, victim);
  await expect(victimPage).toHaveURL(/\/links$/);

  await loginAs(page, admin, "/users");
  await page.getByRole("row", { name: new RegExp(victim.email) }).getByRole("button", { name: "Disable" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Disable" }).click();
  await expect(page.getByRole("row", { name: new RegExp(victim.email) }).getByText("Disabled")).toBeVisible();

  await victimPage.reload();
  await expect(victimPage).toHaveURL(/\/login$/);
  await loginViaUi(victimPage, victim);
  await expect(victimPage.getByText("This account is not allowed to sign in here.")).toBeVisible();
  await victimCtx.close();

  await page.getByRole("row", { name: new RegExp(victim.email) }).getByRole("button", { name: "Enable" }).click();
  await expect(page.getByRole("row", { name: new RegExp(victim.email) }).getByText("Disabled")).toHaveCount(0);
});

test("the audit log records user actions and can be filtered", async ({ page, request, playwright }) => {
  const admin = await createUser(request, { role: "admin" });
  const member = await createUser(request, { role: "member" });
  const api = await apiAs(playwright, admin);
  await api.patch(`/api/users/${member.id}`, { data: { role: "viewer" } });
  await loginAs(page, admin, "/audit");
  await expect(page.getByRole("heading", { name: "Activity log" })).toBeVisible();
  const row = page.getByRole("row", { name: /Role changed/ }).first();
  await expect(row).toContainText(admin.name);
  await expect(row).toContainText(member.email);

  await page.getByLabel("Action").selectOption("invite.create");
  await expect(page.getByRole("row", { name: /Role changed/ })).toHaveCount(0);
  await page.getByLabel("Action").selectOption("");
  await page.getByLabel("User", { exact: true }).selectOption(admin.id);
  await expect(page.getByRole("row", { name: /Role changed/ }).first()).toBeVisible();
  await api.dispose();
});

test("an invitation cannot set a password that the sign-in would refuse", async ({ request, playwright }) => {
  const admin = await createUser(request, { role: "admin" });
  const api = await apiAs(playwright, admin);
  const invite = await (await api.post("/api/invites", { data: { email: "long.password@example.test", role: "member" } })).json();
  const token = new URL(invite.url).pathname.split("/").pop();
  const tooLong = await request.post(`/api/invites/by-token/${token}/accept`, { data: { name: "Long", password: "p".repeat(129) } });
  expect(tooLong.status()).toBe(400);
  const longest = "q".repeat(128);
  const ok = await request.post(`/api/invites/by-token/${token}/accept`, { data: { name: "Long", password: longest } });
  expect(ok.ok(), await ok.text()).toBeTruthy();
  const signIn = await request.post("/api/auth/sign-in/email", {
    data: { email: "long.password@example.test", password: longest },
    headers: { origin: APP },
  });
  expect(signIn.ok()).toBeTruthy();
  await api.dispose();
});
