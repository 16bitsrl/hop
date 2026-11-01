import { Hono } from "hono";
import { z } from "zod";
import { createUserWithPassword } from "../auth/users";
import type { AppEnv } from "../env";
import { setSetting } from "../lib/settings";
import { parseJson } from "../lib/validate";
import { testOutbox } from "../mail";

/**
 * Test helpers, mounted at /api/_test. They answer 404 unless TEST_MODE is on.
 *
 *   POST   /api/_test/users            { role?, name?, email?, password? } -> { id, email, name, role, password }
 *   POST   /api/_test/reset-settings   clears auth, SMTP and single sign-on settings
 *   GET    /api/_test/outbox           mails captured while SMTP host is "outbox.test"
 *   DELETE /api/_test/outbox           empties it
 */
export const testAuthRoutes = new Hono<AppEnv>();

testAuthRoutes.use("*", async (c, next) => {
  if (!c.var.platform.config.testMode) return c.json({ error: "not_found" }, 404);
  await next();
});

export const TEST_PASSWORD = "test-password-123";

const createBody = z.object({
  role: z.enum(["admin", "member", "viewer"]).default("member"),
  name: z.string().optional(),
  email: z.string().optional(),
  password: z.string().optional(),
});

testAuthRoutes.post("/users", async (c) => {
  const body = await parseJson(c, createBody);
  const n = crypto.randomUUID().slice(0, 8);
  const password = body.password ?? TEST_PASSWORD;
  const u = await createUserWithPassword(c.var.platform, {
    name: body.name ?? `Test ${body.role} ${n}`,
    email: body.email ?? `${body.role}-${n}@example.test`,
    password,
    role: body.role,
  });
  return c.json({ id: u.id, email: u.email, name: u.name, role: u.role, password });
});

testAuthRoutes.post("/reset-settings", async (c) => {
  const { db } = c.var.platform;
  await setSetting(db, "auth", { passwordLogin: true });
  await setSetting(db, "oidc", { enabled: false });
  await setSetting(db, "smtp", { host: "" });
  return c.json({ ok: true });
});

testAuthRoutes.get("/outbox", (c) => c.json({ mails: testOutbox }));

testAuthRoutes.delete("/outbox", (c) => {
  testOutbox.length = 0;
  return c.json({ ok: true });
});
