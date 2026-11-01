import { expect, test, type APIRequestContext } from "@playwright/test";
import { apiAs, createUser, loginAs } from "./helpers";
import { ensureDomain, uniq } from "./links-helpers";
import { APP } from "../playwright.config";

/** An API client that authenticates only with the key (no cookie). */
async function withKey(playwright: Parameters<Parameters<typeof test>[2]>[0]["playwright"], secret: string): Promise<APIRequestContext> {
  return playwright.request.newContext({ baseURL: APP, extraHTTPHeaders: { authorization: `Bearer ${secret}` } });
}

test("a member creates a key in the profile, sees the secret once, and uses it as themselves", async ({ page, request, playwright }) => {
  const member = await createUser(request, { role: "member", name: "Key Maker" });
  const admin = await createUser(request, { role: "admin" });
  const adminApi = await apiAs(playwright, admin);
  const domain = await ensureDomain(adminApi);

  await loginAs(page, member, "/profile");
  const card = page.getByTestId("api-keys");
  await card.getByLabel("Key label").fill("CI deploy");
  await card.getByRole("button", { name: "Create key" }).click();
  const secret = (await page.getByTestId("new-key-secret").textContent())!.trim();
  expect(secret).toMatch(/^hop_[A-Za-z0-9_-]{30,}$/);

  // Once the box is closed the secret is gone; the list shows the name and a prefix only.
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("new-key-secret")).toHaveCount(0);
  const row = card.getByRole("row", { name: /CI deploy/ });
  await expect(row).toContainText(secret.slice(0, 8));
  await expect(row).not.toContainText(secret);
  await expect(row).toContainText("Never used");

  const key = await withKey(playwright, secret);
  const me = await (await key.get("/api/me")).json();
  expect(me.user).toMatchObject({ id: member.id, role: "member" });

  const slug = uniq("viakey");
  const created = await key.post("/api/links", { data: { url: "https://example.com/key", slug, domainId: domain.id, fetchMeta: false } });
  expect(created.status()).toBe(201);
  expect((await created.json()).link).toMatchObject({ slug, ownerId: member.id });

  // Same permissions as the user: a member can't open the admin-only settings or other people's links.
  expect((await key.get("/api/settings")).status()).toBe(403);
  const other = await adminApi.post("/api/links", { data: { url: "https://example.com/other", slug: uniq("adm"), domainId: domain.id, fetchMeta: false } });
  const otherId = (await other.json()).link.id;
  expect((await key.patch(`/api/links/${otherId}`, { data: { title: "x" } })).status()).toBe(403);
  // A key cannot create more keys.
  expect((await key.post("/api/api-keys", { data: { name: "nested" } })).status()).toBe(403);

  // Last use is recorded.
  await page.reload();
  await expect(page.getByTestId("api-keys").getByRole("row", { name: /CI deploy/ })).not.toContainText("Never used");

  // Revoking stops it at once.
  await page.getByTestId("api-keys").getByRole("button", { name: "Revoke" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByTestId("api-keys").getByRole("row", { name: /CI deploy/ })).toContainText("Revoked");
  expect((await key.get("/api/me")).status()).toBe(200);
  expect((await (await key.get("/api/me")).json()).user).toBeNull();
  expect((await key.post("/api/links", { data: { url: "https://example.com/key2" } })).status()).toBe(401);

  // The audit log records both events.
  const audit = (await (await adminApi.get("/api/audit?entityType=api_key&pageSize=100")).json()) as { items: { action: string; userId: string }[] };
  expect(audit.items.filter((e) => e.userId === member.id).map((e) => e.action).sort()).toEqual(["key.create", "key.revoke"]);
  await key.dispose();
  await adminApi.dispose();
});

test("garbage and unknown keys are refused; a viewer's key stays read-only; disabled users' keys stop working", async ({ request, playwright }) => {
  const admin = await createUser(request, { role: "admin" });
  const viewer = await createUser(request, { role: "viewer" });
  const adminApi = await apiAs(playwright, admin);
  const viewerApi = await apiAs(playwright, viewer);

  const bad = await withKey(playwright, "hop_notarealkey");
  expect((await (await bad.get("/api/me")).json()).user).toBeNull();
  expect((await bad.get("/api/links")).status()).toBe(401);

  const secret = ((await (await viewerApi.post("/api/api-keys", { data: { name: "read" } })).json()) as { secret: string }).secret;
  const key = await withKey(playwright, secret);
  expect((await key.get("/api/links")).status()).toBe(200);
  expect((await key.post("/api/links", { data: { url: "https://example.com/v" } })).status()).toBe(403);

  expect((await adminApi.patch(`/api/users/${viewer.id}`, { data: { disabled: true } })).ok()).toBeTruthy();
  expect((await key.get("/api/links")).status()).toBe(401);
  expect((await adminApi.patch(`/api/users/${viewer.id}`, { data: { disabled: false } })).ok()).toBeTruthy();
  expect((await key.get("/api/links")).status()).toBe(200);
  await Promise.all([key.dispose(), bad.dispose(), adminApi.dispose(), viewerApi.dispose()]);
});

test("admins see every key on the users page and can revoke them", async ({ page, request, playwright }) => {
  const admin = await createUser(request, { role: "admin" });
  const member = await createUser(request, { role: "member", name: "Someone Else" });
  const memberApi = await apiAs(playwright, member);
  const { secret } = (await (await memberApi.post("/api/api-keys", { data: { name: "Zapier" } })).json()) as { secret: string };
  const key = await withKey(playwright, secret);
  expect((await key.get("/api/links")).status()).toBe(200);

  expect((await memberApi.get("/api/admin/api-keys")).status()).toBe(403);
  await loginAs(page, admin, "/users");
  const section = page.getByTestId("all-api-keys");
  const row = section.getByRole("row", { name: /Zapier/ });
  await expect(row).toContainText("Someone Else");
  await row.getByRole("button", { name: "Revoke" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Revoke" }).click();
  await expect(section.getByRole("row", { name: /Zapier/ })).toContainText("Revoked");
  expect((await key.get("/api/links")).status()).toBe(401);
  await Promise.all([key.dispose(), memberApi.dispose()]);
});

test("the API help page explains the main endpoints", async ({ page, request }) => {
  const member = await createUser(request, { role: "member" });
  await loginAs(page, member, "/profile");
  await page.getByRole("link", { name: "API help" }).click();
  await expect(page).toHaveURL(/\/api-help/);
  await expect(page.getByRole("heading", { name: "Using the API" })).toBeVisible();
  await expect(page.getByText("Authorization: Bearer hop_").first()).toBeVisible();
  await expect(page.getByText("/api/links").first()).toBeVisible();
  await expect(page.getByText("curl").first()).toBeVisible();
  await expect(page.getByText(APP).first()).toBeVisible(); // examples use this installation's address
});

test("an admin API key cannot manage users, settings, backups or imports, only a signed-in session can", async ({ request, playwright }) => {
  const admin = await createUser(request, { role: "admin" });
  const other = await createUser(request, { role: "member" });
  const session = await apiAs(playwright, admin);
  const { secret } = (await (await session.post("/api/api-keys", { data: { name: "admin key" } })).json()) as { secret: string };
  const key = await withKey(playwright, secret);

  // The key is a working admin key for ordinary things...
  expect((await key.get("/api/users")).status()).toBe(200);
  // ...but it cannot hand out access to itself.
  expect((await key.post(`/api/users/${other.id}/reset-link`)).status()).toBe(403);
  expect((await key.post("/api/invites", { data: { email: "escalate@example.test", role: "admin" } })).status()).toBe(403);
  expect((await key.patch(`/api/users/${other.id}`, { data: { role: "admin" } })).status()).toBe(403);
  expect((await key.put("/api/settings/auth", { data: { passwordLogin: true } })).status()).toBe(403);
  expect((await key.put("/api/settings/smtp", { data: { host: "evil.test", port: 25, user: "", from: "a@b.test", tls: "none" } })).status()).toBe(403);
  expect((await key.get("/api/data/backup")).status()).toBe(403);
  expect((await key.post("/api/data/yourls/conflicts", { data: { domainId: "x", keywords: [] } })).status()).toBe(403);

  // The same admin, signed in, can.
  expect((await session.post(`/api/users/${other.id}/reset-link`)).status()).toBe(200);
  expect((await session.get("/api/data/backup")).status()).toBe(200);
  await Promise.all([key.dispose(), session.dispose()]);
});
