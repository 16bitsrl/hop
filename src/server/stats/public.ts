import { and, eq } from "drizzle-orm";
import { links } from "../db/schema";
import type { Platform } from "../platform/types";

/** Public statistics page of a link (for "<slug>+" on a short domain), or null when they are off. */
export async function publicStatsUrl(platform: Platform, domainId: string, slug: string): Promise<string | null> {
  const [row] = await platform.db
    .select({ id: links.id, publicStats: links.publicStats })
    .from(links)
    .where(and(eq(links.domainId, domainId), eq(links.slug, slug)))
    .limit(1);
  return row?.publicStats ? `${platform.config.appUrl}/s/${row.id}` : null;
}
