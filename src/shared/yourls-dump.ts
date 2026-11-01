/**
 * Reader for `mysqldump` files of a YOURLS database. Pure and streaming: feed it decoded text
 * in chunks (it runs in the browser and in tests) and it calls back for every link and click row.
 *
 * mysqldump writes one statement per line (line breaks inside strings are escaped), so the
 * reader works line by line; an INSERT that does not end with ";" continues on the next line.
 */

export type SqlValue = string | number | null;

export type YourlsUrlRow = {
  keyword: string;
  url: string;
  title: string | null;
  /** `YYYY-MM-DD HH:MM:SS` exactly as stored. */
  timestamp: string;
  ip: string | null;
  clicks: number;
};

export type YourlsLogRow = {
  clickId: number;
  /** `YYYY-MM-DD HH:MM:SS` exactly as stored. */
  clickTime: string;
  shortUrl: string;
  referrer: string | null;
  userAgent: string | null;
  ip: string | null;
  country: string | null;
};

/** Column order of the standard YOURLS tables, used when the dump has no CREATE TABLE. */
const DEFAULT_URL_COLUMNS = ["keyword", "url", "title", "timestamp", "ip", "clicks"];
const DEFAULT_LOG_COLUMNS = ["click_id", "click_time", "shorturl", "referrer", "user_agent", "ip_address", "country_code"];

const ESCAPES: Record<string, string> = { "0": "\0", n: "\n", r: "\r", t: "\t", b: "\b", Z: "\x1a" };

/** Reads one quoted string starting after the opening quote; returns the value and the index after the closing quote. */
function readString(src: string, start: number, quote: string): [string, number] {
  let out = "";
  let i = start;
  for (;;) {
    let j = i;
    while (j < src.length && src[j] !== quote && src[j] !== "\\") j++;
    out += src.slice(i, j);
    if (j >= src.length) return [out, j]; // unterminated: take what we have
    if (src[j] === "\\") {
      const next = src[j + 1];
      if (next === undefined) return [out, src.length];
      // MySQL keeps the backslash for \% and \_ (they are LIKE escapes).
      out += next === "%" || next === "_" ? `\\${next}` : (ESCAPES[next] ?? next);
      i = j + 2;
    } else if (src[j + 1] === quote) {
      out += quote; // doubled quote
      i = j + 2;
    } else {
      return [out, j + 1];
    }
  }
}

const isSpace = (ch: string | undefined) => ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
const CHARSET_INTRODUCER = /_[a-z0-9]+\s*(?=['"])/iy;

/** Parses `(a,b,...),(c,d,...);` starting at `from`, calling `onRow` for every tuple. Returns the index where it stopped. */
export function parseValueTuples(src: string, from: number, onRow: (values: SqlValue[]) => void): number {
  let i = from;
  const n = src.length;
  while (i < n) {
    while (i < n && (isSpace(src[i]) || src[i] === ",")) i++;
    if (src[i] !== "(") return i;
    i++;
    const row: SqlValue[] = [];
    for (;;) {
      while (i < n && isSpace(src[i])) i++;
      CHARSET_INTRODUCER.lastIndex = i;
      const intro = CHARSET_INTRODUCER.exec(src);
      if (intro) i += intro[0].length;
      const ch = src[i];
      if (ch === undefined) return n;
      if (ch === "'" || ch === '"') {
        const [value, next] = readString(src, i + 1, ch);
        row.push(value);
        i = next;
      } else {
        let j = i;
        while (j < n && src[j] !== "," && src[j] !== ")") j++;
        const token = src.slice(i, j).trim();
        if (/^null$/i.test(token)) row.push(null);
        else if (token !== "" && !/^0x/i.test(token) && !Number.isNaN(Number(token))) row.push(Number(token));
        else row.push(token);
        i = j;
      }
      while (i < n && isSpace(src[i])) i++;
      if (src[i] === ",") {
        i++;
        continue;
      }
      if (src[i] === ")") {
        i++;
        break;
      }
      return i; // malformed: stop
    }
    onRow(row);
  }
  return i;
}

type Kind = "url" | "log";

export type YourlsDumpHandlers = {
  onUrl?: (row: YourlsUrlRow) => void;
  onLog?: (row: YourlsLogRow) => void;
};

const str = (v: SqlValue | undefined): string | null => (v === null || v === undefined ? null : String(v));

export class YourlsDumpParser {
  /** Table prefix found in the dump (`yourls_`), or null before the first YOURLS table is seen. */
  prefix: string | null = null;
  /** Tables with a YOURLS shape that were not used (a second prefix, for example). */
  ignoredTables: string[] = [];
  urlRows = 0;
  logRows = 0;

  private buf = "";
  private pending: string | null = null;
  private create: { name: string; columns: string[] } | null = null;
  private tables = new Map<string, Kind>();
  private columns = new Map<string, string[]>();

  constructor(private handlers: YourlsDumpHandlers) {}

  /** Feeds decoded text. Chunks can end anywhere. */
  push(chunk: string): void {
    this.buf += chunk;
    let pos = 0;
    for (let nl = this.buf.indexOf("\n", pos); nl >= 0; nl = this.buf.indexOf("\n", pos)) {
      this.line(this.buf.slice(pos, nl).replace(/\r$/, ""));
      pos = nl + 1;
    }
    this.buf = this.buf.slice(pos);
  }

  /** Call after the last chunk. */
  end(): void {
    if (this.buf) this.line(this.buf.replace(/\r$/, ""));
    this.buf = "";
    if (this.pending) this.insert(this.pending);
    this.pending = null;
  }

  private line(line: string): void {
    if (this.create) {
      const col = /^\s*`([^`]+)`\s/.exec(line);
      if (col) this.create.columns.push(col[1]!);
      if (/^\)/.test(line)) {
        this.registerTable(this.create.name, this.create.columns);
        this.create = null;
      }
      return;
    }
    if (this.pending !== null) {
      this.pending += `\n${line}`;
      if (line.trimEnd().endsWith(";")) {
        const stmt = this.pending;
        this.pending = null;
        this.insert(stmt);
      }
      return;
    }
    if (/^INSERT\s/i.test(line)) {
      if (line.trimEnd().endsWith(";")) this.insert(line);
      else this.pending = line;
      return;
    }
    const create = /^CREATE\s+TABLE\s+(?:IF NOT EXISTS\s+)?((?:`[^`]+`|\w+)(?:\.(?:`[^`]+`|\w+))?)/i.exec(line);
    if (create) this.create = { name: lastIdent(create[1]!), columns: [] };
  }

  private registerTable(name: string, columns: string[]): void {
    this.columns.set(name, columns);
    const kind = kindOf(name, columns);
    if (kind) this.adopt(name, kind);
  }

  private adopt(name: string, kind: Kind): boolean {
    if (this.tables.has(name)) return true;
    const prefix = name.slice(0, name.length - 3);
    if (this.prefix === null) this.prefix = prefix;
    if (prefix !== this.prefix) {
      if (!this.ignoredTables.includes(name)) this.ignoredTables.push(name);
      return false;
    }
    this.tables.set(name, kind);
    return true;
  }

  private insert(stmt: string): void {
    const head =
      /^INSERT\s+(?:IGNORE\s+)?INTO\s+((?:`[^`]+`|\w+)(?:\.(?:`[^`]+`|\w+))?)\s*(?:\(([^)]*)\)\s*)?VALUES\s*/i.exec(stmt);
    if (!head) return;
    const name = lastIdent(head[1]!);
    let columns = head[2] ? head[2].split(",").map((c) => c.trim().replace(/^`|`$/g, "")) : (this.columns.get(name) ?? null);
    let kind = this.tables.get(name);
    if (!kind) {
      const guessed = kindOf(name, columns ?? []) ?? (columns ? null : suffixKind(name));
      if (!guessed || !this.adopt(name, guessed)) return;
      kind = guessed;
    }
    columns ??= kind === "url" ? DEFAULT_URL_COLUMNS : DEFAULT_LOG_COLUMNS;
    const idx = new Map(columns.map((c, i) => [c.toLowerCase(), i]));
    const get = (row: SqlValue[], col: string) => row[idx.get(col) ?? -1];

    parseValueTuples(stmt, head[0].length, (row) => {
      if (kind === "url") {
        const keyword = str(get(row, "keyword"));
        const url = str(get(row, "url"));
        if (keyword === null || url === null) return;
        this.urlRows++;
        this.handlers.onUrl?.({
          keyword,
          url,
          title: str(get(row, "title")),
          timestamp: str(get(row, "timestamp")) ?? "",
          ip: str(get(row, "ip")),
          clicks: Number(get(row, "clicks")) || 0,
        });
      } else {
        const shortUrl = str(get(row, "shorturl"));
        if (shortUrl === null) return;
        this.logRows++;
        this.handlers.onLog?.({
          clickId: Number(get(row, "click_id")) || 0,
          clickTime: str(get(row, "click_time")) ?? "",
          shortUrl,
          referrer: str(get(row, "referrer")),
          userAgent: str(get(row, "user_agent")),
          ip: str(get(row, "ip_address")),
          country: str(get(row, "country_code")),
        });
      }
    });
  }
}

function lastIdent(raw: string): string {
  const parts = raw.split(/`\.`|\./);
  return parts[parts.length - 1]!.replace(/`/g, "");
}

function suffixKind(name: string): Kind | null {
  if (/url$/i.test(name)) return "url";
  if (/log$/i.test(name)) return "log";
  return null;
}

function kindOf(name: string, columns: string[]): Kind | null {
  const cols = new Set(columns.map((c) => c.toLowerCase()));
  if (/url$/i.test(name) && cols.has("keyword") && cols.has("url")) return "url";
  if (/log$/i.test(name) && cols.has("click_id") && cols.has("shorturl")) return "log";
  return null;
}

/* ------------------------------------------------------------------ */
/* Time                                                                */
/* ------------------------------------------------------------------ */

/**
 * Epoch milliseconds of a MySQL `YYYY-MM-DD HH:MM:SS` read in a time zone (IANA name, "UTC" by default).
 * Null for empty or zero dates.
 */
export function mysqlDateToMs(value: string | null | undefined, timeZone = "UTC"): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value ?? "");
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  if (y === 0 || mo === 0 || d === 0) return null;
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  if (Number.isNaN(asUtc)) return null;
  if (timeZone === "UTC") return asUtc;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const offsetAt = (t: number) => {
    const p = Object.fromEntries(formatter.formatToParts(new Date(t)).map((x) => [x.type, Number(x.value)]));
    return Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!) - t;
  };
  let t = asUtc - offsetAt(asUtc);
  t = asUtc - offsetAt(t); // a second pass settles dates near a daylight-saving change
  return t;
}
