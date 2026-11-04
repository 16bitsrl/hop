import { expect, test, type Page } from "@playwright/test";
import { apiAs, createUser, loginAs } from "./helpers";
import { createLink, ensureDomain, uniq } from "./links-helpers";

/** Answers every matching request with a 503 until `release()` is called. */
async function failRequests(page: Page, pattern: RegExp) {
  let failing = true;
  await page.route(pattern, (route) =>
    failing ? route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"unavailable"}' }) : route.fallback(),
  );
  return () => {
    failing = false;
  };
}

test.describe("failed loads", () => {
  test("links list shows an error with retry instead of the empty state", async ({ page, request }) => {
    const admin = await createUser(request, { role: "admin" });
    const release = await failRequests(page, /\/api\/links\?/);
    await loginAs(page, admin, "/links");
    await expect(page.getByText("This couldn't be loaded.")).toBeVisible();
    await expect(page.getByText("No links yet")).toHaveCount(0);
    release();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText("This couldn't be loaded.")).toHaveCount(0);
  });

  test("settings shows an error with retry instead of spinning", async ({ page, request }) => {
    const admin = await createUser(request, { role: "admin" });
    const release = await failRequests(page, /\/api\/settings$/);
    await loginAs(page, admin, "/settings");
    await expect(page.getByText("This couldn't be loaded.")).toBeVisible();
    release();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("switch", { name: "Allow signing in with a password" })).toBeVisible();
  });

  test("users list shows an error with retry instead of spinning", async ({ page, request }) => {
    const admin = await createUser(request, { role: "admin" });
    const release = await failRequests(page, /\/api\/users$/);
    await loginAs(page, admin, "/users");
    await expect(page.getByText("This couldn't be loaded.")).toBeVisible();
    release();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText("This couldn't be loaded.")).toHaveCount(0);
    await expect(page.getByRole("row").filter({ hasText: admin.email })).toBeVisible();
  });

  test("activity log shows an error with retry", async ({ page, request }) => {
    const admin = await createUser(request, { role: "admin" });
    const release = await failRequests(page, /\/api\/audit/);
    await loginAs(page, admin, "/audit");
    await expect(page.getByText("This couldn't be loaded.")).toBeVisible();
    release();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText("This couldn't be loaded.")).toHaveCount(0);
  });

  test("reset link dialog shows an error with retry", async ({ page, request }) => {
    const admin = await createUser(request, { role: "admin" });
    const target = await createUser(request, { role: "member", name: uniq("Reset") });
    const release = await failRequests(page, /\/reset-link$/);
    await loginAs(page, admin, "/users");
    await page.getByRole("row").filter({ hasText: target.email }).getByRole("button", { name: "Reset password" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("This couldn't be loaded.")).toBeVisible();
    release();
    await dialog.getByRole("button", { name: "Try again" }).click();
    await expect(dialog.getByLabel("Reset link")).toHaveValue(/reset/);
  });
});

test("mobile menu keeps keyboard focus inside and gives it back on close", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const admin = await createUser(request, { role: "admin" });
  await loginAs(page, admin, "/links");
  // While the menu is open the page behind it is hidden from assistive tech, the menu button too.
  const trigger = page.getByRole("button", { name: "Open menu", includeHidden: true });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");

  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  // Focus moves into the menu.
  expect(await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"))).toBe(true);
  // Tabbing never reaches the page behind it.
  const insideMenu = () => page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"));
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    // The invisible guard at the edge of the menu sends focus back to its first item on the next frame,
    // sooner than anyone presses Tab again.
    if (await page.evaluate(() => !!document.activeElement?.hasAttribute("data-base-ui-focus-guard"))) {
      await expect.poll(insideMenu).toBe(true);
      continue;
    }
    expect(await insideMenu()).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
});

function contrast(fg: string, bg: string) {
  const lum = (c: string) => {
    const [r = 0, g = 0, b = 0] = c.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [x, y] = [lum(fg), lum(bg)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test("danger buttons are readable in light and dark mode", async ({ page, request, playwright }) => {
  const admin = await createUser(request, { role: "admin" });
  const api = await apiAs(playwright, admin);
  await ensureDomain(api);
  const link = await createLink(api, { url: "https://example.com/contrast", slug: uniq("ct") });
  for (const theme of ["light", "dark"]) {
    await page.addInitScript((t) => localStorage.setItem("hop-theme", t), theme);
    await loginAs(page, admin, `/links/${link.id}`);
    const button = page.getByRole("button", { name: "Delete", exact: true });
    await expect(button).toBeVisible();
    const { color, background } = await button.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, background: s.backgroundColor };
    });
    expect(contrast(color, background), `${theme}: ${color} on ${background}`).toBeGreaterThanOrEqual(4.5);
  }
});

test("tabs follow the keyboard model and label their panel", async ({ page, request }) => {
  const admin = await createUser(request, { role: "admin" });
  await loginAs(page, admin, "/settings");
  const first = page.getByRole("tab", { name: "Sign-in" });
  await expect(first).toHaveAttribute("tabindex", "0");
  await expect(page.getByRole("tab", { name: "Email" })).toHaveAttribute("tabindex", "-1");
  await first.focus();
  await page.keyboard.press("ArrowRight");
  const email = page.getByRole("tab", { name: "Email" });
  await expect(email).toBeFocused();
  await expect(email).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Email" })).toBeVisible();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Data" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(first).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Data" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(first).toBeFocused();
  await expect(page.getByRole("tabpanel", { name: "Sign-in" })).toBeVisible();
});

test("form hints and errors are tied to their field", async ({ page, request }) => {
  const admin = await createUser(request, { role: "admin" });
  await loginAs(page, admin, "/domains");
  await page.getByRole("button", { name: "Add domain" }).first().click();
  const dialog = page.getByRole("dialog");
  const host = dialog.getByLabel("Domain", { exact: true });
  await expect(host).toHaveAccessibleDescription("Only the name, like go.example.com. No https:// and no port.");
  await expect(host).not.toHaveAttribute("aria-invalid", "true");
  await host.fill("https://bad host:99");
  await dialog.getByRole("button", { name: "Add domain" }).click();
  await expect(host).toHaveAttribute("aria-invalid", "true");
  await expect(host).toHaveAccessibleDescription("Enter only the domain name, like go.example.com.");
});

test("searchable selects: the arrow and the clear button have a name", async ({ page, request }) => {
  const admin = await createUser(request, { role: "admin" });
  await loginAs(page, admin, "/audit");
  const user = page.getByLabel("User", { exact: true });
  await expect(user).toBeVisible();
  const arrow = page.getByRole("button", { name: "Show options" }).first();
  await expect(arrow).toBeVisible();
  // The field opens its list from the keyboard, so the arrow is not an extra stop.
  await user.focus();
  await page.keyboard.press("Tab");
  await expect(arrow).not.toBeFocused();

  await page.goto("/links");
  const owner = page.getByRole("combobox", { name: "Owner" });
  await owner.click();
  await page.getByRole("option").first().click();
  await expect(page.getByRole("button", { name: "Clear", exact: true })).toBeVisible();
});

test("the copy button turns into a check for a moment, then back", async ({ page, request, playwright, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const admin = await createUser(request, { role: "admin" });
  const api = await apiAs(playwright, admin);
  await ensureDomain(api);
  const link = await createLink(api, { url: "https://example.com/copy", slug: uniq("cp") });
  await loginAs(page, admin, `/links/${link.id}`);
  const button = page.getByRole("button", { name: "Copy short link" });
  await expect(button).not.toHaveAttribute("data-copied");
  await button.click();
  await expect(button).toHaveAttribute("data-copied", "true");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link.shortUrl);
  // About a second and a half later it is a copy button again.
  await expect(button).not.toHaveAttribute("data-copied", { timeout: 3000 });
});
