import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { createAuth } from "../auth/auth";
import { requireUser } from "../auth/permissions";
import { countUsers, createUserWithPassword } from "../auth/users";
import { domains, user } from "../db/schema";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { getAuthSettings, getOidcSettings, isOidcConfigured } from "../lib/settings";
import { fail, parseJson } from "../lib/validate";
import { getMailer } from "../mail";

export const authRoutes = new Hono<AppEnv>();

const PASSWORD_PATHS = ["/api/auth/sign-in/email", "/api/auth/request-password-reset", "/api/auth/reset-password", "/api/auth/forget-password"];

/** Better Auth endpoints. Password endpoints are closed when password login is off. */
authRoutes.all("/auth/*", async (c) => {
  const platform = c.var.platform;
  const path = c.req.path;
  if (PASSWORD_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) {
    const s = await getAuthSettings(platform.db);
    if (!s.passwordLogin) return fail(c, 403, "password_login_disabled");
  }
  const withOidc = path.startsWith("/api/auth/sign-in/social") || path.startsWith("/api/auth/callback/");
  const auth = await createAuth(platform, { oidc: withOidc });
  return auth.handler(c.req.raw);
});

/** Public: what the login page needs to know. */
authRoutes.get("/app-config", async (c) => {
  const { db } = c.var.platform;
  const [users, auth, oidc, mailer] = await Promise.all([
    countUsers(c.var.platform),
    getAuthSettings(db),
    getOidcSettings(db),
    getMailer(c.var.platform),
  ]);
  return c.json({
    setupRequired: users === 0,
    passwordLogin: auth.passwordLogin,
    oidc: isOidcConfigured(oidc) ? { label: oidc.label } : null,
    mailConfigured: !!mailer,
  });
});

const setupBody = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email(),
  password: z.string().min(8).max(200),
});

/** First run: creates the first admin. Closed as soon as any user exists. */
authRoutes.post("/setup", async (c) => {
  const body = await parseJson(c, setupBody);
  if ((await countUsers(c.var.platform)) > 0) return fail(c, 409, "setup_done");
  const admin = await createUserWithPassword(c.var.platform, { ...body, role: "admin" });
  await audit(c, { action: "user.setup", entityType: "user", entityId: admin.id, data: { email: admin.email } });
  return c.json({ ok: true });
});

function publicUser(u: typeof user.$inferSelect) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, locale: u.locale, image: u.image, defaultDomainId: u.defaultDomainId };
}

authRoutes.get("/me", (c) => c.json({ user: c.var.user ? publicUser(c.var.user) : null }));

const meBody = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  locale: z.enum(["en", "it"]).nullable().optional(),
  defaultDomainId: z.string().min(1).nullable().optional(),
});

authRoutes.patch("/me", requireUser, async (c) => {
  const body = await parseJson(c, meBody);
  const me = c.var.user!;
  if (body.defaultDomainId) {
    const exists = await c.var.platform.db.select({ id: domains.id }).from(domains).where(eq(domains.id, body.defaultDomainId)).get();
    if (!exists) return c.json({ error: "invalid_request", fields: ["defaultDomainId"] }, 400);
  }
  await c.var.platform.db
    .update(user)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(user.id, me.id));
  const updated = await c.var.platform.db.select().from(user).where(eq(user.id, me.id)).get();
  return c.json({ user: publicUser(updated!) });
});
