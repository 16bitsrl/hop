import { z } from "zod";
import { isHttpUrl } from "../redirect/destination";
import { SLUG_PATTERN } from "./slug";

/** Request bodies for links. Every URL is validated here, on the server. */

const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => isHttpUrl(v), { message: "invalid_url" });

/** App deep link: any scheme except the dangerous ones (same rule as the redirect page). */
const appUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => {
    const m = /^([a-z][a-z0-9+.-]*):/i.exec(v);
    return !!m && !/^(javascript|data|vbscript|file|blob)$/i.test(m[1]!) && !/[\s<>"]/.test(v);
  });

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const nullableUrl = z.preprocess(emptyToNull, httpUrl.nullable());
const nullableAppUrl = z.preprocess(emptyToNull, appUrl.nullable());
const nullableText = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable());

const targetId = z.string().regex(/^[A-Za-z0-9_-]{1,36}$/).optional();

const rule = z
  .object({
    id: targetId,
    devices: z.array(z.enum(["ios", "android", "desktop", "mobile", "tablet"])).max(5).optional(),
    countries: z.array(z.string().trim().regex(/^[A-Za-z]{2}$/).transform((s) => s.toUpperCase())).max(60).optional(),
    languages: z.array(z.string().trim().regex(/^[A-Za-z]{2,3}$/).transform((s) => s.toLowerCase())).max(30).optional(),
    url: httpUrl,
    appUrl: z.preprocess(emptyToNull, appUrl.nullable().optional()),
  })
  .transform(({ id, devices, countries, languages, url, appUrl }) => ({
    ...(id ? { id } : {}),
    ...(devices?.length ? { devices } : {}),
    ...(countries?.length ? { countries } : {}),
    ...(languages?.length ? { languages } : {}),
    url,
    ...(appUrl ? { appUrl } : {}),
  }));

const variant = z.object({ id: targetId, url: httpUrl, weight: z.number().int().min(1).max(1000) });

const timestamp = z
  .union([z.number(), z.string()])
  .nullable()
  .transform((v, ctx) => {
    if (v === null) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "invalid_date" });
      return z.NEVER;
    }
    return d;
  });

const fields = {
  url: httpUrl,
  title: nullableText(300),
  notes: nullableText(5000),
  folderId: z.string().min(1).nullable(),
  tags: z.array(z.string().trim().min(1).max(50)).max(30),
  redirectType: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]),
  forwardQuery: z.boolean(),
  enabled: z.boolean(),
  /** A string sets the password, null removes it, leave it out to keep it. */
  password: z.string().min(1).max(200).nullable(),
  expiresAt: timestamp,
  maxClicks: z.number().int().min(1).max(1_000_000_000).nullable(),
  fallbackUrl: nullableUrl,
  rules: z.array(rule).max(20),
  variants: z
    .array(variant)
    .max(10)
    .refine((v) => v.length === 0 || v.length >= 2, { message: "variants_min" }),
  appUrl: nullableAppUrl,
  ogTitle: nullableText(300),
  ogDescription: nullableText(1000),
  ogImage: nullableUrl,
  publicStats: z.boolean(),
};

export const slugField = z.string().trim().regex(SLUG_PATTERN);

export const createLinkBody = z.object({
  ...fields,
  title: fields.title.optional(),
  notes: fields.notes.optional(),
  folderId: fields.folderId.optional(),
  tags: fields.tags.optional(),
  redirectType: fields.redirectType.optional(),
  forwardQuery: fields.forwardQuery.optional(),
  enabled: fields.enabled.optional(),
  password: fields.password.optional(),
  expiresAt: fields.expiresAt.optional(),
  maxClicks: fields.maxClicks.optional(),
  fallbackUrl: fields.fallbackUrl.optional(),
  rules: fields.rules.optional(),
  variants: fields.variants.optional(),
  appUrl: fields.appUrl.optional(),
  ogTitle: fields.ogTitle.optional(),
  ogDescription: fields.ogDescription.optional(),
  ogImage: fields.ogImage.optional(),
  publicStats: fields.publicStats.optional(),
  slug: z.preprocess(emptyToNull, slugField.nullable().optional()),
  domainId: z.preprocess(emptyToNull, z.string().nullable().optional()),
  /** Look up the page title when none is given. Defaults to on (off in the test environment). */
  fetchMeta: z.boolean().optional(),
});

export const updateLinkBody = z.object(fields).partial();

export const bulkBody = z.object({
  ids: z.array(z.string()).min(1).max(200),
  action: z.enum(["addTag", "removeTag", "move", "enable", "disable", "delete"]),
  tag: z.string().trim().min(1).max(50).optional(),
  folderId: z.string().min(1).nullable().optional(),
});

export type CreateLinkInput = z.infer<typeof createLinkBody>;
export type UpdateLinkInput = z.infer<typeof updateLinkBody>;

/** Every destination URL in a (partial) link body, for the safety checks. */
export function destinationUrls(input: {
  url?: string;
  fallbackUrl?: string | null;
  rules?: { url: string }[];
  variants?: { url: string }[];
}): string[] {
  return [
    input.url,
    input.fallbackUrl ?? undefined,
    ...(input.rules ?? []).map((r) => r.url),
    ...(input.variants ?? []).map((v) => v.url),
  ].filter((u): u is string => !!u);
}
