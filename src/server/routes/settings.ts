import { Hono } from "hono";
import { z } from "zod";
import { requireRole } from "../auth/permissions";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import {
  getAuthSettings,
  getOidcSettings,
  getSmtpSettings,
  isOidcConfigured,
  setSetting,
} from "../lib/settings";
import { fail, parseJson } from "../lib/validate";
import { getMailer, resolveSmtp } from "../mail";

export const settingsRoutes = new Hono<AppEnv>();

settingsRoutes.use("/settings/*", requireRole("admin"));
settingsRoutes.use("/settings", requireRole("admin"));

settingsRoutes.get("/settings", async (c) => {
  const { db, config } = c.var.platform;
  const [auth, oidc, smtp, effective] = await Promise.all([
    getAuthSettings(db),
    getOidcSettings(db),
    getSmtpSettings(db),
    resolveSmtp(c.var.platform),
  ]);
  const { clientSecret, ...oidcPublic } = oidc;
  const { pass, ...smtpPublic } = smtp;
  return c.json({
    auth,
    oidc: { ...oidcPublic, hasClientSecret: !!clientSecret },
    smtp: { ...smtpPublic, hasPass: !!pass },
    smtpFromEnvironment: !smtp.host && !!effective,
    redirectUri: `${config.appUrl}/api/auth/callback/oidc`,
  });
});

const authBody = z.object({ passwordLogin: z.boolean() });

settingsRoutes.put("/settings/auth", async (c) => {
  const body = await parseJson(c, authBody);
  const oidc = await getOidcSettings(c.var.platform.db);
  // Never lock everyone out: password login can only be turned off when single sign-on works.
  if (!body.passwordLogin && !isOidcConfigured(oidc)) return fail(c, 400, "oidc_required");
  await setSetting(c.var.platform.db, "auth", body);
  await audit(c, { action: "settings.update", entityType: "settings", entityId: "auth", data: body });
  return c.json({ ok: true });
});

const oidcBody = z.object({
  enabled: z.boolean(),
  discoveryUrl: z.string().trim().refine((v) => v === "" || URL.canParse(v)),
  clientId: z.string().trim(),
  clientSecret: z.string().optional(),
  label: z.string().trim().min(1).max(40),
  autoCreate: z.boolean(),
  allowedDomains: z.array(z.string().trim().toLowerCase()).max(50),
  defaultRole: z.enum(["admin", "member", "viewer"]),
});

settingsRoutes.put("/settings/oidc", async (c) => {
  const body = await parseJson(c, oidcBody);
  const { db } = c.var.platform;
  const current = await getOidcSettings(db);
  const next = {
    ...body,
    allowedDomains: body.allowedDomains.filter(Boolean),
    clientSecret: body.clientSecret ? body.clientSecret : current.clientSecret,
  };
  if (next.enabled && (!next.discoveryUrl || !next.clientId)) return fail(c, 400, "oidc_incomplete");
  const auth = await getAuthSettings(db);
  if (!auth.passwordLogin && !isOidcConfigured(next)) return fail(c, 400, "password_login_off");
  await setSetting(db, "oidc", next);
  await audit(c, {
    action: "settings.update",
    entityType: "settings",
    entityId: "oidc",
    data: { enabled: next.enabled, discoveryUrl: next.discoveryUrl, autoCreate: next.autoCreate, defaultRole: next.defaultRole },
  });
  return c.json({ ok: true });
});

const smtpBody = z.object({
  host: z.string().trim(),
  port: z.number().int().min(1).max(65535),
  user: z.string().trim(),
  pass: z.string().optional(),
  from: z.string().trim(),
  tls: z.enum(["none", "starttls", "ssl"]),
});

settingsRoutes.put("/settings/smtp", async (c) => {
  const body = await parseJson(c, smtpBody);
  const { db } = c.var.platform;
  const current = await getSmtpSettings(db);
  const next = { ...body, pass: body.pass ? body.pass : body.user ? current.pass : "" };
  await setSetting(db, "smtp", next);
  await audit(c, {
    action: "settings.update",
    entityType: "settings",
    entityId: "smtp",
    data: { host: next.host, port: next.port, from: next.from, tls: next.tls },
  });
  return c.json({ ok: true });
});

settingsRoutes.post("/settings/smtp/test", async (c) => {
  const { to } = await parseJson(c, z.object({ to: z.email() }));
  const mailer = await getMailer(c.var.platform);
  if (!mailer) return fail(c, 400, "mail_not_configured");
  try {
    await mailer.send({
      to,
      subject: "hop test email",
      text: "This is a test email from hop. Your email settings work.",
    });
  } catch (e) {
    return c.json({ error: "send_failed", message: e instanceof Error ? e.message : String(e) }, 502);
  }
  return c.json({ ok: true });
});
