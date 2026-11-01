import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import type { Role } from "../db/schema";
import { getOidcSettings, isOidcConfigured } from "../lib/settings";
import { actionMail, getMailer } from "../mail";
import type { Platform } from "../platform/types";

/** Internal header carrying the client address to Better Auth's rate limiter. */
export const CLIENT_IP_HEADER = "x-hop-client-ip";

/** Provider id of the configured single sign-on provider. */
export const OIDC_PROVIDER_ID = "oidc";

/**
 * Better Auth instance, built per request (the database binding is per request).
 * The OIDC provider is only attached when `oidc` is true, because attaching it
 * fetches the provider's discovery document.
 */
export async function createAuth(platform: Platform, opts: { oidc?: boolean } = {}) {
  const { db, config } = platform;
  const oidc = await getOidcSettings(db);
  const oidcActive = !!opts.oidc && isOidcConfigured(oidc);

  return betterAuth({
    secret: config.authSecret,
    baseURL: config.appUrl,
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    advanced: {
      backgroundTasks: { handler: (p) => platform.waitUntil(p) },
      // The address is resolved by the platform (see routes/auth.ts) and handed over in this header,
      // which the route always overwrites: nothing sent by the client is ever trusted.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    // On by default only when NODE_ENV=production, which Workers do not set. Counters live in the
    // database because Workers isolates do not share memory.
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 10,
      max: 100,
      customRules: {
        "/get-session": false,
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-in/social": { window: 60, max: 20 },
        "/callback/*": { window: 60, max: 20 },
        "/request-password-reset": { window: 900, max: 5 },
        "/forget-password": { window: 900, max: 5 },
        "/reset-password": { window: 900, max: 10 },
        "/passkey/*": { window: 60, max: 20 },
      },
    },
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "member", input: false },
        disabled: { type: "boolean", required: false, defaultValue: false, input: false },
        locale: { type: "string", required: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 8,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        const mailer = await getMailer(platform);
        if (!mailer) return;
        await mailer.send(
          actionMail({
            to: user.email,
            subject: "Reset your password",
            intro: "Someone asked to reset the password of your account. If it was you, use the link below. It works for one hour.",
            button: "Choose a new password",
            url,
          }),
        );
      },
    },
    account: {
      // Linking to an existing account needs the provider to vouch for the email (see mapProfileToUser).
      accountLinking: { enabled: true },
    },
    plugins: [
      passkey({ rpID: new URL(config.appUrl).hostname, rpName: "hop", origin: config.appUrl }),
      ...(oidcActive
        ? [
            genericOAuth({
              config: [
                {
                  providerId: OIDC_PROVIDER_ID,
                  discoveryUrl: oidc.discoveryUrl,
                  clientId: oidc.clientId,
                  clientSecret: oidc.clientSecret || undefined,
                  scopes: ["openid", "email", "profile"],
                  pkce: true,
                  mapProfileToUser: (p) => ({
                    name: (p.name as string | undefined) || (p.email as string | undefined)?.split("@")[0] || "User",
                    // Only an explicit "true" counts: a missing or false claim must never be enough to
                    // link an existing account, use an invitation or pass the domain check.
                    emailVerified: p.email_verified === true || p.email_verified === "true" || p.emailVerified === true,
                  }),
                },
              ],
            }),
          ]
        : []),
    ],
    databaseHooks: {
      user: {
        create: {
          // Reached by single sign-on sign-ins only: setup and invites insert users directly.
          before: async (u) => {
            if (!u.emailVerified) {
              throw new APIError("FORBIDDEN", { code: "email_not_verified", message: "The provider did not verify this email address" });
            }
            const email = u.email.toLowerCase();
            const invite = await db
              .select()
              .from(schema.invites)
              .where(
                and(
                  sql`lower(${schema.invites.email}) = ${email}`,
                  isNull(schema.invites.acceptedAt),
                  gt(schema.invites.expiresAt, new Date()),
                ),
              )
              .get();
            if (invite) return { data: { ...u, email, role: invite.role } };
            if (!oidc.autoCreate) return false;
            const domain = email.split("@")[1] ?? "";
            const allowed = oidc.allowedDomains.map((d) => d.trim().toLowerCase()).filter(Boolean);
            if (allowed.length > 0 && !allowed.includes(domain)) return false;
            return { data: { ...u, email, role: oidc.defaultRole as Role } };
          },
          after: async (u) => {
            await db
              .update(schema.invites)
              .set({ acceptedAt: new Date() })
              .where(and(sql`lower(${schema.invites.email}) = ${u.email.toLowerCase()}`, isNull(schema.invites.acceptedAt)));
            await db.insert(schema.auditLog).values({
              ts: new Date(),
              userId: u.id,
              action: "user.sso_create",
              entityType: "user",
              entityId: u.id,
              data: { email: u.email },
            });
          },
        },
      },
      session: {
        create: {
          before: async (s) => {
            const u = await db.select({ disabled: schema.user.disabled }).from(schema.user).where(eq(schema.user.id, s.userId)).get();
            if (!u || u.disabled) return false;
          },
        },
      },
    },
  });
}

export type Auth = Awaited<ReturnType<typeof createAuth>>;
