import { expect, type APIRequestContext, type Page, type PlaywrightWorkerArgs } from "@playwright/test";
import { APP } from "../playwright.config";

/**
 * Shared E2E helpers (area A). Everything here talks to the TEST_MODE-only routes under /api/_test.
 *
 *   const admin = await createUser(request, { role: "admin" });
 *   await loginAs(page, admin);               // fast: signs in through the API, cookie lands in the page
 *   const api = await apiAs(playwright, admin); // an API client signed in as that user
 *   await resetSettings(request);             // back to password login on, no SMTP, no single sign-on
 *   const mails = await getOutbox(request);   // mails captured while SMTP host is "outbox.test"
 */

export type TestUser = { id: string; email: string; name: string; role: "admin" | "member" | "viewer"; password: string };

/** Creates a user directly in the test database. Password defaults to "test-password-123". */
export async function createUser(
  request: APIRequestContext,
  opts: { role?: TestUser["role"]; name?: string; email?: string; password?: string } = {},
): Promise<TestUser> {
  const res = await request.post("/api/_test/users", { data: { role: "member", ...opts } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return res.json();
}

/** Signs the page in as the user (through the API, no UI) and opens the app. */
export async function loginAs(page: Page, user: TestUser, path = "/") {
  const res = await page.request.post("/api/auth/sign-in/email", {
    data: { email: user.email, password: user.password },
    headers: { origin: APP },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  await page.goto(path);
}

/** Signs in through the login form, like a person would. */
export async function loginViaUi(page: Page, user: Pick<TestUser, "email" | "password">) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** An API client (own cookie jar) signed in as the user. Dispose it when done. */
export async function apiAs(playwright: PlaywrightWorkerArgs["playwright"], user: TestUser): Promise<APIRequestContext> {
  const ctx = await playwright.request.newContext({ baseURL: APP, extraHTTPHeaders: { origin: APP } });
  const res = await ctx.post("/api/auth/sign-in/email", { data: { email: user.email, password: user.password } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return ctx;
}

export async function resetSettings(request: APIRequestContext) {
  expect((await request.post("/api/_test/reset-settings")).ok()).toBeTruthy();
  await clearOutbox(request);
}

export type OutboxMail = { to: string; subject: string; text: string; html?: string; from: string };

export async function getOutbox(request: APIRequestContext): Promise<OutboxMail[]> {
  return (await (await request.get("/api/_test/outbox")).json()).mails;
}

export async function clearOutbox(request: APIRequestContext) {
  await request.delete("/api/_test/outbox");
}

/** Waits for a mail to the address and returns it. */
export async function waitForMail(request: APIRequestContext, to: string): Promise<OutboxMail> {
  let found: OutboxMail | undefined;
  await expect
    .poll(async () => (found = (await getOutbox(request)).findLast((m) => m.to === to)), { timeout: 10_000 })
    .toBeTruthy();
  return found!;
}

/** First http(s) link found in a mail body. */
export function linkIn(mail: OutboxMail): string {
  const m = mail.text.match(/https?:\/\/\S+/);
  if (!m) throw new Error(`no link in mail: ${mail.text}`);
  return m[0];
}

/** Turns on the in-memory outbox as the SMTP server. */
export async function enableTestSmtp(api: APIRequestContext) {
  const res = await api.put("/api/settings/smtp", {
    data: { host: "outbox.test", port: 587, user: "", from: "hop@example.test", tls: "none" },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
}
