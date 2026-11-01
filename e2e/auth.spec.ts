import { expect, test } from "@playwright/test";
import { APP } from "../playwright.config";
import { createUser, loginAs, loginViaUi } from "./helpers";

test("login and logout", async ({ page, request }) => {
  const user = await createUser(request, { role: "member" });
  await loginViaUi(page, user);
  await expect(page).toHaveURL(/\/links$/);
  await expect(page.getByText(user.name)).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/links");
  await expect(page).toHaveURL(/\/login$/);
});

test("wrong password shows an error and stays on the login page", async ({ page, request }) => {
  const user = await createUser(request);
  await loginViaUi(page, { email: user.email, password: "not-the-password" });
  await expect(page.getByText("Wrong email or password.")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("public sign-up is closed", async ({ request }) => {
  const res = await request.post("/api/auth/sign-up/email", {
    data: { name: "Eve", email: "eve@example.test", password: "password-12345" },
    headers: { origin: APP },
  });
  expect(res.ok()).toBeFalsy();
});

test("API says 401 when signed out", async ({ request }) => {
  expect((await request.get("/api/users")).status()).toBe(401);
  expect((await request.get("/api/me")).status()).toBe(200);
});

test("signed-in user opening /login goes to the app", async ({ page, request }) => {
  const user = await createUser(request);
  await loginAs(page, user, "/login");
  await expect(page).toHaveURL(/\/links$/);
});
