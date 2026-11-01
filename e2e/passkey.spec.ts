import { expect, test, type Page } from "@playwright/test";
import { createUser, loginAs } from "./helpers";

/** Chromium's virtual authenticator stands in for a hardware key or the phone. */
async function addVirtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

test("a user registers a passkey, signs out, and signs in with it", async ({ page, request }) => {
  const user = await createUser(request, { role: "member" });
  await addVirtualAuthenticator(page);
  await loginAs(page, user, "/profile");

  await page.getByRole("button", { name: "Add a passkey" }).click();
  await page.getByLabel("Passkey name").fill("Test laptop");
  await page.getByRole("dialog").getByRole("button", { name: "Add passkey" }).click();
  await expect(page.getByText("Passkey added")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Test laptop" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page).toHaveURL(/\/links$/);
  await expect(page.getByText(user.name)).toBeVisible();

  // Remove it again.
  await page.goto("/profile");
  await page.getByRole("listitem").filter({ hasText: "Test laptop" }).getByRole("button", { name: "Remove" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Test laptop" })).toHaveCount(0);
});
