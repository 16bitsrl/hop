import { expect, test } from "@playwright/test";
import { createUser } from "./helpers";
import { APP } from "../playwright.config";

// In the test environment the client address comes from the x-test-ip header (and is random when absent),
// so these tests never disturb the others.
const from = (ip: string) => ({ origin: APP, "x-test-ip": ip });

test("repeated sign-in attempts from one address are answered with 429, other addresses are not affected", async ({ request }) => {
  const user = await createUser(request);
  const attempt = (ip: string, password = "wrong-password") =>
    request.post("/api/auth/sign-in/email", { data: { email: user.email, password }, headers: from(ip) });

  const statuses: number[] = [];
  for (let i = 0; i < 14; i++) statuses.push((await attempt("198.51.100.10")).status());
  // Ten tries a minute are fine; after that the address has to wait.
  expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
  expect(statuses.slice(10).every((s) => s === 429)).toBe(true);
  // Even the right password is refused while the limit holds.
  expect((await attempt("198.51.100.10", user.password)).status()).toBe(429);

  const other = await attempt("198.51.100.11", user.password);
  expect(other.status()).toBe(200);
});

test("password reset requests are limited per address", async ({ request }) => {
  const statuses: number[] = [];
  for (let i = 0; i < 8; i++) {
    const res = await request.post("/api/auth/request-password-reset", {
      data: { email: "nobody@example.test", redirectTo: `${APP}/reset-password` },
      headers: from("198.51.100.20"),
    });
    statuses.push(res.status());
  }
  expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
  expect(statuses.slice(5).every((s) => s === 429)).toBe(true);
});

test("a spoofed forwarding header does not give an attacker a fresh allowance", async ({ request }) => {
  const user = await createUser(request);
  const statuses: number[] = [];
  for (let i = 0; i < 12; i++) {
    const res = await request.post("/api/auth/sign-in/email", {
      data: { email: user.email, password: "wrong-password" },
      headers: { ...from("198.51.100.30"), "x-forwarded-for": `203.0.113.${i}`, "cf-connecting-ip": `203.0.113.${100 + i}` },
    });
    statuses.push(res.status());
  }
  expect(statuses.at(-1)).toBe(429);
});
