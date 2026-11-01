import { expect, test } from "@playwright/test";
import { APP } from "../playwright.config";
import { apiAs, createUser } from "./helpers";
import { ensureDomain, uniq } from "./links-helpers";

const body = (slug: string) => ({ url: "https://example.com/csrf", slug, fetchMeta: false });

test("a signed-in browser session only changes things when the request comes from the app itself", async ({ request, playwright }) => {
  const admin = await apiAs(playwright, await createUser(request, { role: "admin" }));
  await ensureDomain(admin);

  // A form on a sibling subdomain (or any other site) carries the cookie but not our origin.
  const foreign = await admin.post("/api/links", { data: body(uniq("evil")), headers: { origin: "https://evil.example.com" } });
  expect(foreign.status()).toBe(403);
  expect(await foreign.json()).toMatchObject({ error: "bad_origin" });
  const sibling = await admin.post("/api/links", { data: body(uniq("sib")), headers: { origin: APP.replace("app.", "other.") } });
  expect(sibling.status()).toBe(403);
  const opaque = await admin.post("/api/links", { data: body(uniq("null")), headers: { origin: "null" } });
  expect(opaque.status()).toBe(403);

  // No Origin and no Referer at all: refused too.
  const bare = await admin.post("/api/links", { data: body(uniq("bare")), headers: { origin: "" } });
  expect(bare.status()).toBe(403);

  // Without Origin, a Referer from the app is enough; one from elsewhere is not.
  const referer = await admin.post("/api/links", { data: body(uniq("ref")), headers: { origin: "", referer: `${APP}/links` } });
  expect(referer.status(), await referer.text()).toBe(201);
  const badReferer = await admin.post("/api/links", { data: body(uniq("badref")), headers: { origin: "", referer: "https://evil.example.com/" } });
  expect(badReferer.status()).toBe(403);

  // The app's own origin works, and reading is never affected.
  expect((await admin.post("/api/links", { data: body(uniq("ok")) })).status()).toBe(201);
  expect((await admin.get("/api/links", { headers: { origin: "https://evil.example.com" } })).status()).toBe(200);
  await admin.dispose();
});

test("a body must say it is JSON, so a plain form post cannot be used", async ({ request, playwright }) => {
  const admin = await apiAs(playwright, await createUser(request, { role: "admin" }));
  await ensureDomain(admin);
  const asText = await admin.post("/api/links", { data: JSON.stringify(body(uniq("txt"))), headers: { "content-type": "text/plain" } });
  expect(asText.status()).toBe(415);
  const asForm = await admin.post("/api/links", { form: { url: "https://example.com/f", slug: uniq("frm") } });
  expect(asForm.status()).toBe(415);
  expect((await admin.post("/api/links", { data: body(uniq("json")) })).status()).toBe(201);
  await admin.dispose();
});

test("personal API keys are not tied to an origin", async ({ request, playwright }) => {
  const admin = await apiAs(playwright, await createUser(request, { role: "admin" }));
  await ensureDomain(admin);
  const { secret } = (await (await admin.post("/api/api-keys", { data: { name: "csrf" } })).json()) as { secret: string };
  const key = await playwright.request.newContext({ baseURL: APP, extraHTTPHeaders: { authorization: `Bearer ${secret}` } });
  expect((await key.post("/api/links", { data: body(uniq("key")) })).status()).toBe(201);
  await Promise.all([key.dispose(), admin.dispose()]);
});
