import { and, eq } from "drizzle-orm";
import { links } from "../db/schema";
import type { Platform } from "../platform/types";

/**
 * Statistics page of a link, for "<slug>+" on a short domain (as in YOURLS): the public page when its
 * statistics are public, otherwise the page inside the app, which asks to sign in. Null if there is no such link.
 */
export async function publicStatsUrl(platform: Platform, domainId: string, slug: string): Promise<string | null> {
  const [row] = await platform.db
    .select({ id: links.id, publicStats: links.publicStats })
    .from(links)
    .where(and(eq(links.domainId, domainId), eq(links.slug, slug)))
    .limit(1);
  if (!row) return null;
  return row.publicStats ? `${platform.config.appUrl}/s/${row.id}` : `${platform.config.appUrl}/stats/${row.id}`;
}
