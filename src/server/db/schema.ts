import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey();
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);

/* ------------------------------------------------------------------ */
/* Auth (Better Auth models)                                           */
/* ------------------------------------------------------------------ */

export type Role = "admin" | "member" | "viewer";

export const user = sqliteTable("user", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  role: text("role").$type<Role>().notNull().default("member"),
  disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
  defaultDomainId: text("default_domain_id"),
  locale: text("locale"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = sqliteTable(
  "session",
  {
    id: id(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: id(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = sqliteTable("verification", {
  id: id(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const passkey = sqliteTable(
  "passkey",
  {
    id: id(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: integer("backed_up", { mode: "boolean" }).notNull(),
    transports: text("transports"),
    aaguid: text("aaguid"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("passkey_user_idx").on(t.userId)],
);

/** Better Auth's request counters (sign-in and password reset limits). Not part of a backup. */
export const rateLimit = sqliteTable("rate_limit", {
  id: id(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: integer("last_request").notNull(),
});

/* ------------------------------------------------------------------ */
/* App settings                                                        */
/* ------------------------------------------------------------------ */

/** Key/value settings editable by admins (JSON values). */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: updatedAt(),
});

/* ------------------------------------------------------------------ */
/* Domains, folders, tags                                              */
/* ------------------------------------------------------------------ */

export const domains = sqliteTable("domains", {
  id: id(),
  host: text("host").notNull().unique(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  /** Where "/" on this short domain goes. Null = built-in landing page. */
  rootUrl: text("root_url"),
  /** Where unknown slugs on this domain go. Null = built-in 404 page. */
  notFoundUrl: text("not_found_url"),
  createdAt: createdAt(),
});

export const folders = sqliteTable("folders", {
  id: id(),
  name: text("name").notNull(),
  parentId: text("parent_id"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const tags = sqliteTable("tags", {
  id: id(),
  name: text("name").notNull().unique(),
  color: text("color"),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/* Links                                                               */
/* ------------------------------------------------------------------ */

export type RedirectType = 301 | 302 | 307 | 308;

/** A conditional destination. All set conditions must match. */
export type LinkRule = {
  /** Stays the same when the rule is edited or moved, so clicks keep pointing to it. See links/targets.ts. */
  id?: string;
  devices?: ("ios" | "android" | "desktop" | "mobile" | "tablet")[];
  countries?: string[]; // ISO 3166-1 alpha-2, uppercase
  languages?: string[]; // primary language subtag, lowercase ("it", "en")
  url: string;
  /** Optional app deep link tried first; `url` is the fallback. */
  appUrl?: string;
};

/** A/B test variant. Weights are relative. */
export type LinkVariant = { id?: string; url: string; weight: number };

export const links = sqliteTable(
  "links",
  {
    id: id(),
    domainId: text("domain_id")
      .notNull()
      .references(() => domains.id),
    slug: text("slug").notNull(),
    url: text("url").notNull(),
    title: text("title"),
    notes: text("notes"),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    folderId: text("folder_id").references(() => folders.id, { onDelete: "set null" }),
    redirectType: integer("redirect_type").$type<RedirectType>().notNull().default(302),
    forwardQuery: integer("forward_query", { mode: "boolean" }).notNull().default(false),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    passwordHash: text("password_hash"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    maxClicks: integer("max_clicks"),
    /** Where to send visitors once expired/disabled. Null = domain 404. */
    fallbackUrl: text("fallback_url"),
    rules: text("rules", { mode: "json" }).$type<LinkRule[]>().notNull().default(sql`'[]'`),
    variants: text("variants", { mode: "json" }).$type<LinkVariant[]>().notNull().default(sql`'[]'`),
    /** App deep link for the main destination (C5). */
    appUrl: text("app_url"),
    ogTitle: text("og_title"),
    ogDescription: text("og_description"),
    ogImage: text("og_image"),
    publicStats: integer("public_stats", { mode: "boolean" }).notNull().default(false),
    /** Visits by people (bots are only in `clicks`, flagged `bot`); a YOURLS import starts it at the old lifetime total. Also what `maxClicks` is compared with. */
    clickCount: integer("click_count").notNull().default(0),
    lastClickedAt: integer("last_clicked_at", { mode: "timestamp_ms" }),
    /** Broken link check (J5). */
    healthStatus: text("health_status").$type<"unknown" | "ok" | "broken">().notNull().default("unknown"),
    healthCode: integer("health_code"),
    healthCheckedAt: integer("health_checked_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("links_domain_slug_uq").on(t.domainId, t.slug),
    index("links_owner_idx").on(t.ownerId),
    index("links_folder_idx").on(t.folderId),
    index("links_created_idx").on(t.createdAt),
  ],
);

export const linkTags = sqliteTable(
  "link_tags",
  {
    linkId: text("link_id")
      .notNull()
      .references(() => links.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.linkId, t.tagId] }), index("link_tags_tag_idx").on(t.tagId)],
);

/** Password guesses on protected links, per link and visitor (hashed address). Not part of a backup. */
export const linkPasswordAttempts = sqliteTable(
  "link_password_attempts",
  {
    linkId: text("link_id")
      .notNull()
      .references(() => links.id, { onDelete: "cascade" }),
    ipHash: text("ip_hash").notNull(),
    count: integer("count").notNull(),
    windowStart: integer("window_start").notNull(),
  },
  (t) => [primaryKey({ columns: [t.linkId, t.ipHash] })],
);

/* ------------------------------------------------------------------ */
/* Clicks                                                              */
/* ------------------------------------------------------------------ */

export const clicks = sqliteTable(
  "clicks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    linkId: text("link_id")
      .notNull()
      .references(() => links.id, { onDelete: "cascade" }),
    ts: integer("ts", { mode: "timestamp_ms" }).notNull(),
    referrer: text("referrer"),
    referrerHost: text("referrer_host"),
    country: text("country"),
    region: text("region"),
    city: text("city"),
    device: text("device"), // desktop | mobile | tablet | other
    os: text("os"),
    browser: text("browser"),
    language: text("language"),
    bot: integer("bot", { mode: "boolean" }).notNull().default(false),
    /** sha256(daily salt + ip + ua), truncated. Never the raw IP. */
    visitorHash: text("visitor_hash"),
    /** Which destination served: "main", "rule:<id>", "variant:<id>". */
    target: text("target"),
    /** The address it sent the visitor to, as it was then (empty for clicks recorded before it was kept). */
    targetUrl: text("target_url"),
    source: text("source").$type<"live" | "import">().notNull().default("live"),
    /** Identity of an imported click ("yourls:<domain id>:<click id>"): importing twice never duplicates. */
    importKey: text("import_key"),
  },
  (t) => [
    index("clicks_link_ts_idx").on(t.linkId, t.ts),
    index("clicks_ts_idx").on(t.ts),
    uniqueIndex("clicks_import_key_uq").on(t.importKey),
  ],
);

/* ------------------------------------------------------------------ */
/* Team, API, audit, safety                                            */
/* ------------------------------------------------------------------ */

export const invites = sqliteTable("invites", {
  id: id(),
  email: text("email").notNull(),
  role: text("role").$type<Role>().notNull().default("member"),
  tokenHash: text("token_hash").notNull().unique(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
});

export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** First characters shown in the UI to recognise the key. */
    prefix: text("prefix").notNull(),
    hash: text("hash").notNull().unique(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("api_keys_user_idx").on(t.userId)],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ts: integer("ts", { mode: "timestamp_ms" }).notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(), // e.g. link.create, link.update, user.role
    entityType: text("entity_type").notNull(), // link | user | domain | settings | ...
    entityId: text("entity_id"),
    /** { before, after } or free-form details. */
    data: text("data", { mode: "json" }),
  },
  (t) => [index("audit_entity_idx").on(t.entityType, t.entityId, t.ts), index("audit_ts_idx").on(t.ts)],
);

export const blockedDomains = sqliteTable("blocked_domains", {
  id: id(),
  host: text("host").notNull().unique(),
  reason: text("reason"),
  createdAt: createdAt(),
});
