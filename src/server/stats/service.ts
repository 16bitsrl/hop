import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { domains, links } from "../db/schema";
import type { AppEnv } from "../env";
import { fail } from "../lib/validate";
import type { DB } from "../platform/types";
import { type Filter, firstClickAt } from "./queries";
import { isValidTimeZone } from "./range";

const YEAR_MS = 366 * 86_400_000;

export type LinkInfo = typeof links.$inferSelect & { host: string };

export async function findLink(db: DB, id: string): Promise<LinkInfo | null> {
  const [row] = await db
    .select({ link: links, host: domains.host })
    .from(links)
    .innerJoin(domains, eq(domains.id, links.domainId))
    .where(eq(links.id, id))
    .limit(1);
  return row ? { ...row.link, host: row.host } : null;
}

function intParam(value: string | undefined): number | null | "bad" {
  if (value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : "bad";
}

/**
 * Reads `from`, `to` (ms since epoch), `tz` (IANA) and `bots` from the query string.
 * A missing `from` means "since the first click". Answers a 400 Response when invalid.
 */
export async function parseFilter(
  c: Context<AppEnv>,
  linkId: string | null,
  forceNoBots = false,
): Promise<Filter | Response> {
  const q = c.req.query();
  const from = intParam(q.from);
  const to = intParam(q.to);
  const tz = q.tz || "UTC";
  if (from === "bad" || to === "bad" || !isValidTimeZone(tz)) return fail(c, 400, "invalid_range");
  const end = to ?? Date.now();
  let start = from;
  if (start === null) start = (await firstClickAt(c.var.platform.db, linkId)) ?? end - 7 * 86_400_000;
  if (start > end || end - start > 20 * YEAR_MS) return fail(c, 400, "invalid_range");
  return { linkId, from: start, to: end, tz, bots: !forceNoBots && (q.bots === "1" || q.bots === "true") };
}
