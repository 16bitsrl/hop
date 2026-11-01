export const RANGE_IDS = ["24h", "7d", "30d", "90d", "12m", "all", "custom"] as const;
export type RangeId = (typeof RANGE_IDS)[number];

/** `from` and `to` are dates as "YYYY-MM-DD", used by the custom range. */
export type RangeState = { id: RangeId; from: string; to: string };

export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/** "YYYY-MM-DD" of a date in the browser's time zone. */
export function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - 1;
const daysAgo = (now: Date, n: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - n);

export function defaultRange(now = new Date()): RangeState {
  return { id: "7d", from: toDateInput(daysAgo(now, 6)), to: toDateInput(now) };
}

function parseDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

const DAYS: Partial<Record<RangeId, number>> = { "7d": 7, "30d": 30, "90d": 90, "12m": 365 };

/**
 * Milliseconds range for the picker, in the browser's time zone. `from` null = since the first click.
 * Day based ranges run from midnight of the first day to the end of today. Null when a custom range is invalid.
 */
export function resolveRange(state: RangeState, now = new Date()): { from: number | null; to: number } | null {
  const today = endOfDay(now);
  if (state.id === "24h") {
    const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).getTime();
    return { from: hourStart - 23 * 3_600_000, to: hourStart + 3_600_000 - 1 };
  }
  if (state.id === "all") return { from: null, to: today };
  if (state.id === "custom") {
    const from = parseDate(state.from);
    const to = parseDate(state.to);
    if (!from || !to || from > to) return null;
    return { from: from.getTime(), to: endOfDay(to) };
  }
  return { from: startOfDay(daysAgo(now, DAYS[state.id]! - 1)).getTime(), to: today };
}
