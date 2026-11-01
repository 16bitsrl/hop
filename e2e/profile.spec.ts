import { expect, test } from "@playwright/test";
import { createUser, loginAs } from "./helpers";

test("language switch to Italian is saved and applied", async ({ page, request }) => {
  const user = await createUser(request, { role: "admin" });
  await loginAs(page, user, "/profile");
  await page.getByLabel("Language").selectOption("it");
  await expect(page.getByRole("link", { name: "Domini" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Registro attività" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Impostazioni" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Profilo" })).toBeVisible();

  // Stored on the user: still Italian after a reload and on another page.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Profilo" })).toBeVisible();
  await page.getByRole("link", { name: "Utenti" }).click();
  await expect(page.getByRole("heading", { name: "Utenti" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Invita utente" })).toBeVisible();
});

test("name and theme can be changed", async ({ page, request }) => {
  const user = await createUser(request, { role: "member" });
  await loginAs(page, user, "/profile");
  await page.getByLabel("Name").fill("Renamed Person");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Name")).toHaveValue("Renamed Person");

  await page.getByLabel("Theme").selectOption("dark");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByLabel("Theme").selectOption("light");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("the shell works on a phone: menu opens in a drawer", async ({ page, request }) => {
  const user = await createUser(request, { role: "member" });
  await page.setViewportSize({ width: 390, height: 800 });
  await loginAs(page, user);
  await expect(page.getByRole("link", { name: "Domains" })).toBeHidden();
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("link", { name: "Domains" }).click();
  await expect(page).toHaveURL(/\/domains$/);
  await expect(page.getByRole("link", { name: "Domains" })).toBeHidden();
});
