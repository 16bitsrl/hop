import { sql } from "drizzle-orm";
import type { DB } from "../platform/types";

export const APP_VERSION = "0.1.0";

export type Stats = {
  version: string;
  links: { total: number; enabled: number; broken: number };
  clicks: { total: number; last24h: number };
  users: Record<string, number>;
  domains: number;
};

const escapeLabel = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

/** Prometheus text exposition format (version 0.0.4). */
export function formatMetrics(s: Stats): string {
  const out: string[] = [];
  const metric = (name: string, help: string, type: "gauge" | "counter", samples: { labels?: Record<string, string>; value: number }[]) => {
    out.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`);
    for (const { labels, value } of samples) {
      const l = labels
        ? `{${Object.entries(labels)
            .map(([k, v]) => `${k}="${escapeLabel(v)}"`)
            .join(",")}}`
        : "";
      out.push(`${name}${l} ${value}`);
    }
  };
  metric("hop_build_info", "Build information.", "gauge", [{ labels: { version: s.version }, value: 1 }]);
  metric("hop_links", "Number of links.", "gauge", [{ value: s.links.total }]);
  metric("hop_links_enabled", "Number of enabled links.", "gauge", [{ value: s.links.enabled }]);
  metric("hop_links_broken", "Number of links whose destination is broken.", "gauge", [{ value: s.links.broken }]);
  metric("hop_clicks_total", "Recorded clicks.", "counter", [{ value: s.clicks.total }]);
  metric("hop_clicks_last_24h", "Clicks recorded in the last 24 hours.", "gauge", [{ value: s.clicks.last24h }]);
  metric(
    "hop_users",
    "Number of users by role.",
    "gauge",
    Object.entries(s.users).map(([role, value]) => ({ labels: { role }, value })),
  );
  metric("hop_domains", "Number of short domains.", "gauge", [{ value: s.domains }]);
  return `${out.join("\n")}\n`;
}

const num = (v: unknown) => Number(v) || 0;

export async function collectStats(db: DB, now = Date.now()): Promise<Stats> {
  const [linkRow] = await db.all<{ total: number; enabled: number; broken: number }>(
    sql`select count(*) as total, coalesce(sum(enabled), 0) as enabled, coalesce(sum(health_status = 'broken'), 0) as broken from links`,
  );
  const [clickRow] = await db.all<{ total: number; recent: number }>(
    sql`select count(*) as total, coalesce(sum(ts >= ${now - 86_400_000}), 0) as recent from clicks`,
  );
  const roleRows = await db.all<{ role: string; n: number }>(sql`select role, count(*) as n from user group by role`);
  const [domainRow] = await db.all<{ n: number }>(sql`select count(*) as n from domains`);
  const users: Record<string, number> = { admin: 0, member: 0, viewer: 0 };
  for (const r of roleRows) users[r.role] = num(r.n);
  return {
    version: APP_VERSION,
    links: { total: num(linkRow?.total), enabled: num(linkRow?.enabled), broken: num(linkRow?.broken) },
    clicks: { total: num(clickRow?.total), last24h: num(clickRow?.recent) },
    users,
    domains: num(domainRow?.n),
  };
}

/** True when the Authorization header carries the configured token (compared in constant time). */
export function metricsAuthorized(header: string | null | undefined, token: string | undefined): boolean {
  if (!token) return false;
  const m = /^Bearer\s+(.+)$/i.exec(header ?? "");
  if (!m) return false;
  const a = new TextEncoder().encode(m[1]!);
  const b = new TextEncoder().encode(token);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
