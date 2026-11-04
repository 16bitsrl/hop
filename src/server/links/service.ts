import { and, eq, inArray } from "drizzle-orm";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { domains, folders, linkTags, links, tags, user } from "../db/schema";
import type { LinkRule, LinkVariant, RedirectType } from "../db/schema";
import type { SessionUser } from "../env";
import { canModify } from "../auth/permissions";
import { getSetting } from "../lib/settings";
import { hashLinkPassword } from "../lib/password";
import type { Config, DB, Platform } from "../platform/types";
import { fetchPageMeta, isPrivateHost, type PageMeta } from "./meta";
import { destinationUrls, type CreateLinkInput, type UpdateLinkInput } from "./schemas";
import { checkDestinations } from "./safety";
import { DEFAULT_SLUG_SETTINGS, generateSlug, type SlugSettings } from "./slug";
import { assignIds, withIds } from "./targets";

export type LinkRow = typeof links.$inferSelect;
export type TagRow = typeof tags.$inferSelect;

/** An error with an API code. Routes turn it into `{ error: code }`. */
export class LinkError extends Error {
  constructor(
    public status: 400 | 403 | 404 | 409,
    public code: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

/** `app.onError` handler for routes that throw LinkError. */
export function linkErrorHandler(e: Error, c: Context): Response | Promise<Response> {
  if (e instanceof LinkError) return c.json({ error: e.code, ...e.extra }, e.status);
  if (e instanceof HTTPException) return e.getResponse();
  throw e;
}

export const getSlugSettings = (db: DB) => getSetting<SlugSettings>(db, "slugs", DEFAULT_SLUG_SETTINGS);

/* ---------------------------------------------------------------- */
/* Output                                                            */
/* ---------------------------------------------------------------- */

export type LinkState = "active" | "disabled" | "expired" | "broken" | "protected";

export function linkStates(r: LinkRow, now = Date.now()): LinkState[] {
  const expired =
    (r.expiresAt != null && r.expiresAt.getTime() <= now) || (r.maxClicks != null && r.clickCount >= r.maxClicks);
  const states: LinkState[] = [];
  if (!r.enabled) states.push("disabled");
  if (expired) states.push("expired");
  if (r.enabled && !expired) states.push("active");
  if (r.healthStatus === "broken") states.push("broken");
  if (r.passwordHash) states.push("protected");
  return states;
}

/** Public URL of a short link. Local development keeps the port of the app host. */
export function shortUrlFor(config: Config, host: string, slug: string): string {
  const scheme = new URL(config.appUrl).protocol;
  const port = /:(\d+)$/.exec(config.appHost)?.[1];
  return `${scheme}//${host}${port ? `:${port}` : ""}/${slug}`;
}

export type LinkJson = ReturnType<typeof toJson>;

function toJson(
  r: LinkRow,
  extra: { host: string; shortUrl: string; ownerName: string | null; tags: { id: string; name: string; color: string | null }[]; canModify: boolean },
) {
  return {
    id: r.id,
    domainId: r.domainId,
    host: extra.host,
    shortUrl: extra.shortUrl,
    slug: r.slug,
    url: r.url,
    title: r.title,
    notes: r.notes,
    ownerId: r.ownerId,
    ownerName: extra.ownerName,
    folderId: r.folderId,
    tags: extra.tags,
    redirectType: r.redirectType,
    forwardQuery: r.forwardQuery,
    enabled: r.enabled,
    hasPassword: !!r.passwordHash,
    expiresAt: r.expiresAt,
    maxClicks: r.maxClicks,
    fallbackUrl: r.fallbackUrl,
    rules: withIds(r.rules ?? []),
    variants: withIds(r.variants ?? []),
    appUrl: r.appUrl,
    ogTitle: r.ogTitle,
    ogDescription: r.ogDescription,
    ogImage: r.ogImage,
    publicStats: r.publicStats,
    clickCount: r.clickCount,
    lastClickedAt: r.lastClickedAt,
    healthStatus: r.healthStatus,
    healthCode: r.healthCode,
    healthCheckedAt: r.healthCheckedAt,
    states: linkStates(r),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    canModify: extra.canModify,
  };
}

/** D1 allows 100 bound parameters per query: stay well below it. */
const CHUNK = 50;
async function inChunks<T, R>(items: T[], run: (chunk: T[]) => Promise<R[]>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(...(await run(items.slice(i, i + CHUNK))));
  return out;
}

/** Rows to API objects: adds domain host, owner name, tags and what the viewer may do. Never the password hash. */
export async function serializeLinks(platform: Platform, me: SessionUser, rows: LinkRow[]): Promise<LinkJson[]> {
  if (rows.length === 0) return [];
  const { db, config } = platform;
  const domainRows = await db.select({ id: domains.id, host: domains.host }).from(domains);
  const hosts = new Map(domainRows.map((d) => [d.id, d.host]));

  const ownerIds = [...new Set(rows.map((r) => r.ownerId).filter((v): v is string => !!v))];
  const owners = new Map(
    (await inChunks(ownerIds, (ids) => db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, ids)))).map((o) => [o.id, o.name]),
  );

  const tagRows = await inChunks(
    rows.map((r) => r.id),
    (ids) =>
      db
        .select({ linkId: linkTags.linkId, id: tags.id, name: tags.name, color: tags.color })
        .from(linkTags)
        .innerJoin(tags, eq(tags.id, linkTags.tagId))
        .where(inArray(linkTags.linkId, ids)),
  );
  const tagsByLink = new Map<string, { id: string; name: string; color: string | null }[]>();
  for (const t of tagRows) {
    const list = tagsByLink.get(t.linkId) ?? [];
    list.push({ id: t.id, name: t.name, color: t.color });
    tagsByLink.set(t.linkId, list);
  }

  return rows.map((r) => {
    const host = hosts.get(r.domainId) ?? "";
    return toJson(r, {
      host,
      shortUrl: shortUrlFor(config, host, r.slug),
      ownerName: r.ownerId ? (owners.get(r.ownerId) ?? null) : null,
      tags: (tagsByLink.get(r.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
      canModify: canModify(me, r.ownerId),
    });
  });
}

export async function getLinkRow(db: DB, id: string): Promise<LinkRow> {
  const row = await db.select().from(links).where(eq(links.id, id)).get();
  if (!row) throw new LinkError(404, "not_found");
  return row;
}

/* ---------------------------------------------------------------- */
/* Audit snapshots                                                   */
/* ---------------------------------------------------------------- */

/** Readable, secret-free view of a link for the history (tag and folder names, no hash). */
export async function auditSnapshot(db: DB, link: LinkJson): Promise<Record<string, unknown>> {
  let folder: string | null = null;
  if (link.folderId) folder = (await db.select({ name: folders.name }).from(folders).where(eq(folders.id, link.folderId)).get())?.name ?? null;
  return {
    host: link.host,
    slug: link.slug,
    url: link.url,
    title: link.title,
    notes: link.notes,
    folder,
    tags: link.tags.map((t) => t.name),
    redirectType: link.redirectType,
    forwardQuery: link.forwardQuery,
    enabled: link.enabled,
    hasPassword: link.hasPassword,
    expiresAt: link.expiresAt,
    maxClicks: link.maxClicks,
    fallbackUrl: link.fallbackUrl,
    rules: link.rules,
    variants: link.variants,
    appUrl: link.appUrl,
    ogTitle: link.ogTitle,
    ogDescription: link.ogDescription,
    ogImage: link.ogImage,
    publicStats: link.publicStats,
  };
}

/** Only the keys that changed, before and after. Empty `after` means nothing changed. */
export function diffSnapshots(before: Record<string, unknown>, after: Record<string, unknown>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      b[key] = before[key] ?? null;
      a[key] = after[key] ?? null;
    }
  }
  return { before: b, after: a };
}

/* ---------------------------------------------------------------- */
/* Tags                                                              */
/* ---------------------------------------------------------------- */

export const TAG_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899"];

export function defaultTagColor(name: string): string {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length]!;
}

/** Finds tags by name (case-insensitive) and creates the missing ones with an automatic color. */
export async function ensureTags(db: DB, names: string[]): Promise<TagRow[]> {
  const wanted = [...new Map(names.map((n) => [n.trim().toLowerCase(), n.trim()])).values()].filter(Boolean);
  if (wanted.length === 0) return [];
  const existing = await db.select().from(tags);
  const byName = new Map(existing.map((t) => [t.name.toLowerCase(), t]));
  const out: TagRow[] = [];
  for (const name of wanted) {
    let tag = byName.get(name.toLowerCase());
    if (!tag) {
      [tag] = await db.insert(tags).values({ id: crypto.randomUUID(), name, color: defaultTagColor(name) }).returning();
      byName.set(name.toLowerCase(), tag!);
    }
    out.push(tag!);
  }
  return out;
}

export async function setLinkTags(db: DB, linkId: string, tagNames: string[]): Promise<void> {
  const rows = await ensureTags(db, tagNames);
  await db.delete(linkTags).where(eq(linkTags.linkId, linkId));
  for (const t of rows) await db.insert(linkTags).values({ linkId, tagId: t.id }).onConflictDoNothing();
}

/* ---------------------------------------------------------------- */
/* Create / update                                                   */
/* ---------------------------------------------------------------- */

const isUniqueViolation = (e: unknown): boolean => {
  const text = (x: unknown): string => (x instanceof Error ? `${x.message} ${text((x as { cause?: unknown }).cause)}` : "");
  return /UNIQUE constraint failed/i.test(text(e));
};

export async function resolveDomain(db: DB, me: SessionUser, domainId?: string | null) {
  if (domainId) {
    const row = await db.select().from(domains).where(eq(domains.id, domainId)).get();
    if (!row) throw new LinkError(400, "unknown_domain");
    return row;
  }
  if (me.defaultDomainId) {
    const row = await db.select().from(domains).where(eq(domains.id, me.defaultDomainId)).get();
    if (row) return row;
  }
  const def = await db.select().from(domains).where(eq(domains.isDefault, true)).get();
  if (def) return def;
  const any = await db.select().from(domains).orderBy(domains.createdAt).limit(1).get();
  if (!any) throw new LinkError(400, "no_domain");
  return any;
}

async function slugExists(db: DB, domainId: string, slug: string): Promise<boolean> {
  return !!(await db.select({ id: links.id }).from(links).where(and(eq(links.domainId, domainId), eq(links.slug, slug))).get());
}

/** Refuses blocked or unsafe destinations. */
export async function assertSafe(platform: Platform, urls: string[]): Promise<void> {
  const verdict = await checkDestinations(platform.db, urls, platform.config.safeBrowsingKey);
  if (!verdict.ok) throw new LinkError(400, verdict.error, { url: verdict.url });
}

/** Page metadata lookup. The test environment never reaches the public internet. */
export async function lookupPageMeta(config: Config, url: string): Promise<PageMeta | null> {
  if (config.testMode && !isPrivateHost(new URL(url).hostname)) return null;
  return fetchPageMeta(url, { allowPrivate: config.testMode });
}

/** Creates a link owned by `me`. Used by the API and by the CSV import. */
export async function createLinkRecord(
  platform: Platform,
  me: SessionUser,
  input: CreateLinkInput,
  opts: { skipSafety?: boolean; domainId?: string } = {},
): Promise<LinkRow> {
  const { db, config } = platform;
  const domain = await resolveDomain(db, me, opts.domainId ?? input.domainId);
  if (!opts.skipSafety) await assertSafe(platform, destinationUrls(input));
  await assertFolder(db, input.folderId);

  let slug = input.slug ?? null;
  if (slug) {
    if (await slugExists(db, domain.id, slug)) throw new LinkError(409, "slug_taken");
  } else {
    const settings = await getSlugSettings(db);
    for (let i = 0; i < 12 && !slug; i++) {
      // Grow the slug when the space is crowded, so creation never loops forever.
      const candidate = generateSlug({ ...settings, length: settings.length + Math.floor(i / 4) });
      if (!(await slugExists(db, domain.id, candidate))) slug = candidate;
    }
    if (!slug) throw new LinkError(409, "slug_taken");
  }

  let title = input.title ?? null;
  if (!title && (input.fetchMeta ?? !config.testMode)) {
    title = (await lookupPageMeta(config, input.url))?.title ?? null;
  }

  const id = crypto.randomUUID();
  try {
    await db.insert(links).values({
      id,
      domainId: domain.id,
      slug,
      url: input.url,
      title,
      notes: input.notes ?? null,
      ownerId: me.id,
      folderId: input.folderId ?? null,
      redirectType: (input.redirectType ?? 302) as RedirectType,
      forwardQuery: input.forwardQuery ?? false,
      enabled: input.enabled ?? true,
      passwordHash: input.password ? await hashLinkPassword(input.password) : null,
      expiresAt: input.expiresAt ?? null,
      maxClicks: input.maxClicks ?? null,
      fallbackUrl: input.fallbackUrl ?? null,
      rules: assignIds((input.rules ?? []) as LinkRule[]),
      variants: assignIds((input.variants ?? []) as LinkVariant[]),
      appUrl: input.appUrl ?? null,
      ogTitle: input.ogTitle ?? null,
      ogDescription: input.ogDescription ?? null,
      ogImage: input.ogImage ?? null,
      publicStats: input.publicStats ?? false,
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new LinkError(409, "slug_taken");
    throw e;
  }
  if (input.tags?.length) await setLinkTags(db, id, input.tags);
  return getLinkRow(db, id);
}

async function assertFolder(db: DB, folderId: string | null | undefined) {
  if (!folderId) return;
  const f = await db.select({ id: folders.id }).from(folders).where(eq(folders.id, folderId)).get();
  if (!f) throw new LinkError(400, "unknown_folder");
}

export async function updateLinkRecord(platform: Platform, current: LinkRow, input: UpdateLinkInput): Promise<LinkRow> {
  const { db } = platform;
  const touchesUrls =
    input.url !== undefined || input.fallbackUrl !== undefined || input.rules !== undefined || input.variants !== undefined;
  if (touchesUrls) await assertSafe(platform, destinationUrls(input));
  await assertFolder(db, input.folderId);

  const set: Partial<typeof links.$inferInsert> = { updatedAt: new Date() };
  if (input.url !== undefined && input.url !== current.url) {
    // A new destination has not been checked yet: the old verdict does not apply to it.
    Object.assign(set, { url: input.url, healthStatus: "unknown", healthCode: null, healthCheckedAt: null });
  }
  if (input.title !== undefined) set.title = input.title;
  if (input.notes !== undefined) set.notes = input.notes;
  if (input.folderId !== undefined) set.folderId = input.folderId;
  if (input.redirectType !== undefined) set.redirectType = input.redirectType;
  if (input.forwardQuery !== undefined) set.forwardQuery = input.forwardQuery;
  if (input.enabled !== undefined) set.enabled = input.enabled;
  if (input.password !== undefined) set.passwordHash = input.password === null ? null : await hashLinkPassword(input.password);
  if (input.expiresAt !== undefined) set.expiresAt = input.expiresAt;
  if (input.maxClicks !== undefined) set.maxClicks = input.maxClicks;
  if (input.fallbackUrl !== undefined) set.fallbackUrl = input.fallbackUrl;
  if (input.rules !== undefined) set.rules = assignIds(input.rules as LinkRule[], current.rules ?? []);
  if (input.variants !== undefined) set.variants = assignIds(input.variants as LinkVariant[], current.variants ?? []);
  if (input.appUrl !== undefined) set.appUrl = input.appUrl;
  if (input.ogTitle !== undefined) set.ogTitle = input.ogTitle;
  if (input.ogDescription !== undefined) set.ogDescription = input.ogDescription;
  if (input.ogImage !== undefined) set.ogImage = input.ogImage;
  if (input.publicStats !== undefined) set.publicStats = input.publicStats;

  await db.update(links).set(set).where(eq(links.id, current.id));
  if (input.tags !== undefined) await setLinkTags(db, current.id, input.tags);
  return getLinkRow(db, current.id);
}
