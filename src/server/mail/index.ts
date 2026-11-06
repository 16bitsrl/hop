import { getSmtpSettings } from "../lib/settings";
import type { Mail, Mailer, Platform, SmtpConfig } from "../platform/types";
import { mailMessages, type MailLanguage } from "./messages";

export { mailLanguage, mailMessages, type MailLanguage } from "./messages";

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

export const APP_NAME = "hop";
const BRAND = "#0f7a5c";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Wraps a message body in the app's look: logo and name on top, the sending site at the bottom. */
export function brandedHtml(lang: MailLanguage, appUrl: string, body: string): string {
  const logo = escapeHtml(`${appUrl.replace(/\/$/, "")}/icon-192.png`);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f2;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
<tr><td style="padding:0 4px 20px;font-family:${FONT};">
<img src="${logo}" width="32" height="32" alt="" style="vertical-align:middle;border:0;border-radius:8px;">
<span style="vertical-align:middle;margin-left:8px;font-size:18px;font-weight:600;color:#1a1a1a;">${APP_NAME}</span>
</td></tr>
<tr><td style="background:#ffffff;border:1px solid #e6e6e3;border-radius:12px;padding:28px;font-family:${FONT};font-size:15px;line-height:1.55;color:#1a1a1a;">
${body}
</td></tr>
<tr><td style="padding:16px 4px 0;font-family:${FONT};font-size:12px;line-height:1.5;color:#8a8a86;">${escapeHtml(mailMessages[lang].sentBy(APP_NAME, new URL(appUrl).host))}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function brandedText(lang: MailLanguage, appUrl: string, body: string): string {
  return `${body}\n\n--\n${mailMessages[lang].sentBy(APP_NAME, new URL(appUrl).host)}\n`;
}

/** A plain message in the app's look, without a call to action. */
export function noticeMail(opts: { lang: MailLanguage; appUrl: string; to: string; subject: string; text: string }): Mail {
  return {
    to: opts.to,
    subject: opts.subject,
    text: brandedText(opts.lang, opts.appUrl, opts.text),
    html: brandedHtml(opts.lang, opts.appUrl, `<p style="margin:0;">${escapeHtml(opts.text)}</p>`),
  };
}

/** A mail in the app's look with one call to action button. */
export function actionMail(opts: { lang: MailLanguage; appUrl: string; to: string; subject: string; intro: string; button: string; url: string }): Mail {
  const url = escapeHtml(opts.url);
  return {
    to: opts.to,
    subject: opts.subject,
    text: brandedText(opts.lang, opts.appUrl, `${opts.intro}\n\n${opts.button}: ${opts.url}`),
    html: brandedHtml(
      opts.lang,
      opts.appUrl,
      `<p style="margin:0 0 24px;">${escapeHtml(opts.intro)}</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:${BRAND};">
<a href="${url}" style="display:inline-block;padding:11px 20px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(opts.button)}</a>
</td></tr></table>
<p style="margin:24px 0 0;font-size:13px;color:#6b6b67;">${escapeHtml(mailMessages[opts.lang].fallback)}<br><a href="${url}" style="color:${BRAND};word-break:break-all;">${url}</a></p>`,
    ),
  };
}
