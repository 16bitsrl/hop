import { getSmtpSettings } from "../lib/settings";
import type { Mail, Mailer, Platform, SmtpConfig } from "../platform/types";

/** Mails captured in memory when TEST_MODE is on and the SMTP host is "outbox.test". */
export const testOutbox: (Mail & { from: string; at: number })[] = [];
export const TEST_SMTP_HOST = "outbox.test";

/** SMTP configuration: the settings screen first, then SMTP_* environment variables. */
export async function resolveSmtp(platform: Platform): Promise<SmtpConfig | null> {
  const s = await getSmtpSettings(platform.db);
  if (s.host) {
    return {
      host: s.host,
      port: s.port,
      user: s.user || undefined,
      pass: s.pass || undefined,
      from: s.from || `hop@${platform.config.appHost.split(":")[0]}`,
      tls: s.tls,
    };
  }
  return platform.config.smtp ?? null;
}

function buildMailer(platform: Platform, smtp: SmtpConfig): Mailer {
  if (platform.config.testMode && smtp.host === TEST_SMTP_HOST) {
    return {
      async send(mail) {
        testOutbox.push({ ...mail, from: smtp.from, at: Date.now() });
      },
    };
  }
  return platform.createSmtpMailer(smtp);
}

/** The mailer to use right now, or null when email is not configured. */
export async function getMailer(platform: Platform): Promise<Mailer | null> {
  const smtp = await resolveSmtp(platform);
  return smtp ? buildMailer(platform, smtp) : null;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

/** A plain, branded-less mail with one call to action link. */
export function actionMail(opts: { to: string; subject: string; intro: string; button: string; url: string }): Mail {
  return {
    to: opts.to,
    subject: opts.subject,
    text: `${opts.intro}\n\n${opts.button}: ${opts.url}\n`,
    html: `<p>${escapeHtml(opts.intro)}</p><p><a href="${escapeHtml(opts.url)}">${escapeHtml(opts.button)}</a></p><p>${escapeHtml(opts.url)}</p>`,
  };
}
