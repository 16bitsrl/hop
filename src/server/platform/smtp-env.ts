import type { SmtpConfig } from "./types";

/** SMTP_* variables, read the same way on every platform. */
export interface SmtpEnv {
  APP_HOST: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM?: string;
  SMTP_SECURE?: string;
}

export function smtpFromEnv(env: SmtpEnv): SmtpConfig | undefined {
  if (!env.SMTP_HOST) return undefined;
  const port = Number(env.SMTP_PORT ?? 587);
  const secure = env.SMTP_SECURE === "1" || env.SMTP_SECURE === "true" || port === 465;
  return {
    host: env.SMTP_HOST,
    port,
    user: env.SMTP_USER || undefined,
    pass: env.SMTP_PASS || undefined,
    from: env.SMTP_FROM || `hop@${env.APP_HOST.split(":")[0]}`,
    tls: secure ? "ssl" : "starttls",
  };
}
