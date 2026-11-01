import { and, eq, sql } from "drizzle-orm";
import { links } from "../db/schema";
import { getSetting } from "../lib/settings";
import type { DB, Platform } from "../platform/types";
import { isPrivateHost } from "./meta";

/** Broken link check (J5). */

export type HealthSettings = { enabled: boolean; recheckDays: number };
export const defaultHealthSettings: HealthSettings = { enabled: true, recheckDays: 7 };
export const getHealthSettings = (db: DB) => getSetting(db, "linkHealth", defaultHealthSettings);

export type LinkHealth = { status: "unknown" | "ok" | "broken"; code: number | null };
export type Verdict = { kind: "ok" | "fail"; code: number } | { kind: "skipped" };

/** A destination counts as failing on 404, 410, any 5xx, or no answer at all (code 0). */
export const isFailCode = (code: number | null | undefined): boolean =>
  code === 0 || code === 404 || code === 410 || (typeof code === "number" && code >= 500);

export function classifyStatus(code: number): "ok" | "fail" {
  return isFailCode(code) ? "fail" : "ok";
}

/** Marks a link broken only when this check and the one before it both failed. */
export function nextHealth(prev: LinkHealth, verdict: Verdict): LinkHealth {
  if (verdict.kind === "skipped") return prev;
  if (verdict.kind === "ok") return { status: "ok", code: verdict.code };
  return { status: isFailCode(prev.code) || prev.status === "broken" ? "broken" : prev.status, code: verdict.code };
}

const TIMEOUT_MS = 10_000;
const MAX_HOPS = 5;
const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; hop-link-checker/1.0)", accept: "*/*" };

export type ProbeOptions = { allowPrivate?: boolean; fetchImpl?: typeof fetch; timeoutMs?: number };

/** One request, following redirects by hand so every hop is checked against the private-host rule. */
async function request(method: "HEAD" | "GET", start: string, opts: ProbeOptions, signal: AbortSignal): Promise<number | "blocked"> {
  const doFetch = opts.fetchImpl ?? fetch;
  let url = start;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const target = new URL(url);
    if (target.protocol !== "http:" && target.protocol !== "https:") return "blocked";
    if (!opts.allowPrivate && isPrivateHost(target.hostname)) return "blocked";
    const res = await doFetch(target.href, { method, headers: HEADERS, redirect: "manual", signal });
    void res.body?.cancel().catch(() => {});
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, target).href;
      continue;
    }
    return res.status;
  }
  return 310; // redirect loop: the destination answers, we just stop following
}

/** Checks one destination: HEAD, then GET when the server refuses HEAD. Never throws. */
export async function probe(url: string, opts: ProbeOptions = {}): Promise<Verdict> {
  const signal = AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS);
  try {
    let result = await request("HEAD", url, opts, signal);
    if (result === 405 || result === 501) result = await request("GET", url, opts, signal);
    if (result === "blocked") return { kind: "skipped" };
    return { kind: classifyStatus(result), code: result };
  } catch {
    return { kind: "fail", code: 0 };
  }
}

type LinkRow = typeof links.$inferSelect;

/**
 * Checks one link and stores the result. `confirm` retries a failure at once, so the verdict
 * is final (used by "check now"); the scheduled job leaves the second look to its next run.
 */
export async function checkLink(platform: Platform, link: LinkRow, opts: { confirm?: boolean; fetchImpl?: typeof fetch } = {}): Promise<LinkRow> {
  const { db, config } = platform;
  const probeOpts = { allowPrivate: config.testMode, fetchImpl: opts.fetchImpl };
  let health: LinkHealth = { status: link.healthStatus, code: link.healthCode };
  let verdict = await probe(link.url, probeOpts);
  health = nextHealth(health, verdict);
  if (opts.confirm && verdict.kind === "fail") {
    verdict = await probe(link.url, probeOpts);
    health = nextHealth(health, verdict);
  }
  await db
    .update(links)
    .set({ healthStatus: health.status, healthCode: health.code, healthCheckedAt: new Date() })
    .where(eq(links.id, link.id));
  return { ...link, healthStatus: health.status, healthCode: health.code, healthCheckedAt: new Date() };
}

const BATCH = 20;
const PARALLEL = 5;

/** Links to look at next: never checked, then failures waiting for a second look, then the least recently checked. */
export async function dueLinks(db: DB, recheckDays: number, now: number, limit = BATCH): Promise<LinkRow[]> {
  const cutoff = now - recheckDays * 86_400_000;
  const failing = sql`(${links.healthCode} = 0 or ${links.healthCode} = 404 or ${links.healthCode} = 410 or ${links.healthCode} >= 500)`;
  return db
    .select()
    .from(links)
    .where(
      and(
        eq(links.enabled, true),
        sql`(${links.healthCheckedAt} is null or ${links.healthCheckedAt} < ${cutoff} or (${links.healthStatus} != 'broken' and ${failing}))`,
      ),
    )
    .orderBy(sql`${links.healthCheckedAt} is not null`, links.healthCheckedAt, sql`${links.createdAt} desc`)
    .limit(limit);
}

/** The scheduled job: a small batch of due links per run. */
export async function checkDueLinks(platform: Platform, now = Date.now()): Promise<number> {
  const { db } = platform;
  const settings = await getHealthSettings(db);
  if (!settings.enabled) return 0;
  const due = await dueLinks(db, settings.recheckDays, now);
  for (let i = 0; i < due.length; i += PARALLEL) {
    await Promise.all(due.slice(i, i + PARALLEL).map((l) => checkLink(platform, l).catch((e) => console.error("link check failed", e))));
  }
  return due.length;
}
