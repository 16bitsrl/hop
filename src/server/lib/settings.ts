import { eq } from "drizzle-orm";
import { settings } from "../db/schema";
import type { Role } from "../db/schema";
import type { DB } from "../platform/types";

/** Key/value settings (JSON). Other areas can store their own keys with these helpers. */
export async function getSetting<T extends object>(db: DB, key: string, fallback: T): Promise<T> {
  const row = await db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return fallback;
  return { ...fallback, ...(row.value as object) } as T;
}

export async function setSetting(db: DB, key: string, value: unknown): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

export type AuthSettings = { passwordLogin: boolean };
export const defaultAuthSettings: AuthSettings = { passwordLogin: true };

export type OidcSettings = {
  enabled: boolean;
  discoveryUrl: string;
  clientId: string;
  clientSecret: string;
  label: string;
  autoCreate: boolean;
  /** Empty = any domain. */
  allowedDomains: string[];
  defaultRole: Role;
};
export const defaultOidcSettings: OidcSettings = {
  enabled: false,
  discoveryUrl: "",
  clientId: "",
  clientSecret: "",
  label: "Single sign-on",
  autoCreate: false,
  allowedDomains: [],
  defaultRole: "member",
};

export type SmtpSettings = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  tls: "none" | "starttls" | "ssl";
};
export const defaultSmtpSettings: SmtpSettings = {
  host: "",
  port: 587,
  user: "",
  pass: "",
  from: "",
  tls: "starttls",
};

export const getAuthSettings = (db: DB) => getSetting(db, "auth", defaultAuthSettings);
export const getOidcSettings = (db: DB) => getSetting(db, "oidc", defaultOidcSettings);
export const getSmtpSettings = (db: DB) => getSetting(db, "smtp", defaultSmtpSettings);

export function isOidcConfigured(o: OidcSettings): boolean {
  return o.enabled && !!o.discoveryUrl && !!o.clientId;
}
