/** Pure helpers for statistics ranges: time zones, daylight saving, bucket keys. */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type Bucket = "hour" | "day" | "month";

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

/** Milliseconds to add to a UTC instant to get the wall clock in `tz` (east of UTC is positive). */
export function offsetAt(tz: string, ms: number): number {
  const parts = formatter(tz).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wall - Math.floor(ms / 1000) * 1000;
}

export type OffsetSegment = { start: number; offset: number };

/**
 * The UTC offsets in force between `from` and `to`, in order. The first segment starts at `from`;
 * each next one starts exactly at a daylight saving transition.
 */
export function offsetSegments(tz: string, from: number, to: number): OffsetSegment[] {
  const segments: OffsetSegment[] = [{ start: from, offset: offsetAt(tz, from) }];
  let prevTime = from;
  let prevOffset = segments[0]!.offset;
  for (let t = from + DAY; ; t += DAY) {
    const time = Math.min(t, to);
    const offset = offsetAt(tz, time);
    if (offset !== prevOffset) {
      // Binary search the first millisecond that already has the new offset.
      let lo = prevTime;
      let hi = time;
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (offsetAt(tz, mid) === prevOffset) lo = mid;
        else hi = mid;
      }
      segments.push({ start: hi, offset });
      prevOffset = offset;
    }
    prevTime = time;
    if (time >= to) break;
  }
  return segments;
}

/** Hours for ranges up to 2 days, days up to about a year, months beyond. */
export function chooseBucket(from: number, to: number): Bucket {
  const span = to - from;
  if (span <= 2 * DAY) return "hour";
  if (span <= 400 * DAY) return "day";
  return "month";
}

const keyLength: Record<Bucket, number> = { hour: 13, day: 10, month: 7 };

/** Bucket label of a wall clock instant, same shape as SQLite's strftime output below. */
function wallKey(bucket: Bucket, wallMs: number): string {
  return new Date(wallMs).toISOString().slice(0, keyLength[bucket]);
}

/** SQLite strftime pattern giving the same labels as `bucketKeys`. */
export const bucketFormat: Record<Bucket, string> = {
  hour: "%Y-%m-%dT%H",
  day: "%Y-%m-%d",
  month: "%Y-%m",
};

/** Every bucket label between `from` and `to` in the time zone, empty ones included. */
export function bucketKeys(bucket: Bucket, from: number, to: number, tz: string): string[] {
  const wallFrom = from + offsetAt(tz, from);
  const wallTo = to + offsetAt(tz, to);
  if (bucket === "day") {
    const keys: string[] = [];
    for (let d = Math.floor(wallFrom / DAY); d <= Math.floor(wallTo / DAY); d++) keys.push(wallKey("day", d * DAY));
    return keys;
  }
  if (bucket === "month") {
    const a = new Date(wallFrom);
    const b = new Date(wallTo);
    const keys: string[] = [];
    for (let y = a.getUTCFullYear(), m = a.getUTCMonth(); y < b.getUTCFullYear() || (y === b.getUTCFullYear() && m <= b.getUTCMonth()); ) {
      keys.push(wallKey("month", Date.UTC(y, m, 1)));
      if (++m === 12) {
        m = 0;
        y++;
      }
    }
    return keys;
  }
  const keys = new Set<string>();
  for (let t = from; t <= to; t += HOUR) keys.add(wallKey("hour", t + offsetAt(tz, t)));
  keys.add(wallKey("hour", wallTo));
  return [...keys];
}
