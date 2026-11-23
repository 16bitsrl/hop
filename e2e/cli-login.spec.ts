import { createHash, randomBytes } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { apiAs, createUser, loginViaUi } from "./helpers";
import { APP } from "../playwright.config";

/** What the command line app does when someone runs `hop login`: it makes a key and asks hop to accept it. */
function newDeviceKey() {
  const secret = `hop_${randomBytes(32).toString("base64url")}`;
  return { secret, keyHash: createHash("sha256").update(secret).digest("hex"), prefix: secret.slice(0, 8) };
}

type Started = { code: string; verifyUrl: string; expiresIn: number; interval: number };

async function start(request: APIRequestContext, key: ReturnType<typeof newDeviceKey>, name = "hop CLI (test-laptop)") {
  const res = await request.post("/api/cli/login", { data: { name, keyHash: key.keyHash, prefix: key.prefix } });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as Started;
}

const poll = async (request: APIRequestContext, keyHash: string) =>
  ((await (await request.post("/api/cli/login/poll", { data: { keyHash } })).json()) as { status: string }).status;

test("signing in from the terminal: the person approves in the browser and the key starts working", async ({ page, request, playwright }) => {
  const member = await createUser(request, { role: "member", name: "Terminal Fan" });
  const key = newDeviceKey();
  const started = await start(request, key);
  expect(started.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  expect(started.verifyUrl).toBe(`${APP}/cli/${started.code}`);
  expect(await poll(request, key.keyHash)).toBe("pending");

  const client = await playwright.request.newContext({ baseURL: APP, extraHTTPHeaders: { authorization: `Bearer ${key.secret}` } });
  expect((await client.get("/api/links")).status()).toBe(401);

  // Not signed in yet: the page asks to sign in, then comes back to the request.
  await page.goto(started.verifyUrl);
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill(member.email);
  await page.getByLabel("Password").fill(member.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/cli/${started.code}$`));
  await expect(page.getByRole("heading", { name: "Connect the command line app" })).toBeVisible();
  await expect(page.getByText("hop CLI (test-laptop)")).toBeVisible();
  await expect(page.getByText(started.code)).toBeVisible();
  await expect(page.getByText(member.email)).toBeVisible();

  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByText("You can go back to your terminal")).toBeVisible();

  expect(await poll(request, key.keyHash)).toBe("approved");
  const me = (await (await client.get("/api/me")).json()) as { user: { id: string } };
  expect(me.user.id).toBe(member.id);

  // The key is listed in the profile like any other, so it can be revoked there.
  await page.goto("/profile");
  const row = page.getByTestId("api-keys").getByRole("row", { name: /hop CLI \(test-laptop\)/ });
  await expect(row).toContainText(key.prefix);

  // The same request cannot be used twice.
  const again = await page.request.post(`/api/cli/login/${started.code}/approve`, { headers: { origin: APP } });
  expect(again.status()).toBe(404);
  await client.dispose();
});

test("refusing a request leaves the key useless", async ({ page, request, playwright }) => {
  const member = await createUser(request, { role: "member" });
  const key = newDeviceKey();
  const started = await start(request, key);

  await loginViaUi(page, member);
  await expect(page).toHaveURL(/\/links$/);
  // Typing the code by hand, as when the terminal is on another computer.
  await page.goto("/cli");
  await page.getByLabel("Code").fill(started.code.toLowerCase());
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("hop CLI (test-laptop)")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Request refused")).toBeVisible();

  expect(await poll(request, key.keyHash)).toBe("denied");
  const client = await playwright.request.newContext({ baseURL: APP, extraHTTPHeaders: { authorization: `Bearer ${key.secret}` } });
  expect((await client.get("/api/links")).status()).toBe(401);
  await client.dispose();
});

test("requests are checked: bad input, unknown codes, and an API key cannot approve", async ({ page, request, playwright }) => {
  const key = newDeviceKey();
  for (const data of [
    { name: "", keyHash: key.keyHash, prefix: key.prefix },
    { name: "x", keyHash: "abc", prefix: key.prefix },
    { name: "x", keyHash: key.keyHash, prefix: "nope" },
  ]) {
    expect((await request.post("/api/cli/login", { data })).status()).toBe(400);
  }
  expect(await poll(request, key.keyHash)).toBe("expired");

  const admin = await createUser(request, { role: "admin" });
  const session = await apiAs(playwright, admin);
  expect((await session.get("/api/cli/login/ZZZZ-ZZZZ")).status()).toBe(404);

  // Signed out, the request cannot be read or approved.
  const started = await start(request, key);
  expect((await request.get(`/api/cli/login/${started.code}`)).status()).toBe(401);
  expect((await request.post(`/api/cli/login/${started.code}/approve`)).status()).toBe(401);

  // A key cannot hand out more keys.
  const { secret } = (await (await session.post("/api/api-keys", { data: { name: "existing" } })).json()) as { secret: string };
  const withKey = await playwright.request.newContext({ baseURL: APP, extraHTTPHeaders: { authorization: `Bearer ${secret}` } });
  expect((await withKey.post(`/api/cli/login/${started.code}/approve`)).status()).toBe(403);

  // The same key cannot be offered twice.
  expect((await request.post("/api/cli/login", { data: { name: "again", keyHash: key.keyHash, prefix: key.prefix } })).status()).toBe(409);

  // An unknown code typed by hand is explained.
  await page.goto("/login");
  await page.getByLabel("Email").fill(admin.email);
  await page.getByLabel("Password").fill(admin.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/links$/);
  await page.goto("/cli/ZZZZ-ZZZZ");
  await expect(page.getByText("This code is not valid anymore")).toBeVisible();
  await Promise.all([session.dispose(), withKey.dispose()]);
});

test("a flood of requests cannot lock people out: the oldest make room", async ({ request }) => {
  const first = newDeviceKey();
  await start(request, first, "the oldest one");
  // More than the installation keeps waiting at once.
  for (let i = 0; i < 205; i++) {
    const key = newDeviceKey();
    expect((await request.post("/api/cli/login", { data: { name: `flood ${i}`, keyHash: key.keyHash, prefix: key.prefix } })).status()).toBe(201);
  }
  expect(await poll(request, first.keyHash)).toBe("expired");
  const latest = newDeviceKey();
  await start(request, latest, "a real person");
  expect(await poll(request, latest.keyHash)).toBe("pending");
});

test("approving never leaves a request approved without its key, and a full key list refuses cleanly", async ({ request, playwright }) => {
  const member = await createUser(request, { role: "member" });
  const session = await apiAs(playwright, member);
  for (let i = 0; i < 20; i++) expect((await session.post("/api/api-keys", { data: { name: `key ${i}` } })).status()).toBe(201);
  const key = newDeviceKey();
  const started = await start(request, key);
  expect((await session.post(`/api/cli/login/${started.code}/approve`)).status()).toBe(409);
  expect(await poll(request, key.keyHash)).toBe("pending");

  // Two approvals of the same request at once: one key, one success.
  const other = await apiAs(playwright, await createUser(request, { role: "member" }));
  const both = await Promise.all([other.post(`/api/cli/login/${started.code}/approve`), other.post(`/api/cli/login/${started.code}/approve`)]);
  expect(both.map((r) => r.status()).sort()).toEqual([200, 404]);
  expect(await poll(request, key.keyHash)).toBe("approved");
  const keys = (await (await other.get("/api/api-keys")).json()).keys as unknown[];
  expect(keys).toHaveLength(1);
  await Promise.all([session.dispose(), other.dispose()]);
});
