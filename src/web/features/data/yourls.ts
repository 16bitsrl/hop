import { api } from "../../lib/api";
import { mysqlDateToMs, YourlsDumpParser, type YourlsLogRow, type YourlsUrlRow } from "../../../shared/yourls-dump";

/** Reading a YOURLS dump in the browser and sending it to the server in small chunks. */

export type DumpSummary = {
  prefix: string | null;
  links: YourlsUrlRow[];
  clickCount: number;
  /** Clicks whose short link is not in the dump (not imported). */
  orphanClicks: number;
  /** First and last click time as written in the dump (`YYYY-MM-DD HH:MM:SS`). */
  firstClick: string | null;
  lastClick: string | null;
  lifetimeClicks: number;
};

const LINK_CHUNK = 200;
const CLICK_CHUNK = 500;

/** Streams the file through the parser (gunzips `.gz` first). `onLog` may be async: reading waits for it. */
export async function readDump(
  file: File,
  handlers: { onUrl?: (row: YourlsUrlRow) => void; onLog?: (rows: YourlsLogRow[]) => Promise<void> | void },
  onProgress?: (fraction: number) => void,
): Promise<YourlsDumpParser> {
  const buffer: YourlsLogRow[] = [];
  const parser = new YourlsDumpParser({
    onUrl: handlers.onUrl,
    onLog: (row) => {
      buffer.push(row);
    },
  });
  let stream: ReadableStream<Uint8Array> = file.stream();
  let counted = 0;
  // Progress is measured on the compressed bytes, which is what the file size tells us.
  stream = stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        counted += chunk.byteLength;
        onProgress?.(Math.min(1, counted / Math.max(1, file.size)));
        controller.enqueue(chunk);
      },
    }),
  );
  if (/\.gz$/i.test(file.name) || file.type === "application/gzip") {
    stream = stream.pipeThrough(new DecompressionStream("gzip") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  }
  const reader = stream.pipeThrough(new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>).getReader();
  const flush = async (all: boolean) => {
    while (buffer.length >= CLICK_CHUNK || (all && buffer.length > 0)) await handlers.onLog?.(buffer.splice(0, CLICK_CHUNK));
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.push(value);
    await flush(false);
  }
  parser.end();
  await flush(true);
  return parser;
}

/** First pass: what is in the file. */
export async function summarizeDump(file: File, onProgress?: (fraction: number) => void): Promise<DumpSummary> {
  const links: YourlsUrlRow[] = [];
  const perKeyword = new Map<string, number>();
  let clickCount = 0;
  let first: string | null = null;
  let last: string | null = null;
  const parser = await readDump(
    file,
    {
      onUrl: (r) => links.push(r),
      onLog: (rows) => {
        for (const r of rows) {
          clickCount++;
          perKeyword.set(r.shortUrl, (perKeyword.get(r.shortUrl) ?? 0) + 1);
          if (mysqlDateToMs(r.clickTime) !== null) {
            if (first === null || r.clickTime < first) first = r.clickTime;
            if (last === null || r.clickTime > last) last = r.clickTime;
          }
        }
      },
    },
    onProgress,
  );
  const known = new Set(links.map((l) => l.keyword));
  let orphanClicks = 0;
  for (const [keyword, n] of perKeyword) if (!known.has(keyword)) orphanClicks += n;
  return {
    prefix: parser.prefix,
    links,
    clickCount,
    orphanClicks,
    firstClick: first,
    lastClick: last,
    lifetimeClicks: links.reduce((sum, l) => sum + l.clicks, 0),
  };
}

export type ImportOptions = {
  domainId: string;
  ownerId: string;
  redirectType: 301 | 302 | 307 | 308;
  onConflict: "skip" | "overwrite";
  timeZone: string;
};

export type ImportReport = {
  created: number;
  updated: number;
  skipped: number;
  failed: { keyword: string; error: string }[];
  clicksImported: number;
  clicksDuplicates: number;
  clicksOrphans: number;
  clicksInvalid: number;
  totals: { links: number; lifetimeClicks: number; importedClicks: number } | null;
};

export type ImportProgress = { phase: "links" | "clicks"; done: number; total: number };

/** Second pass: sends links, then clicks, chunk by chunk. */
export async function runImport(
  file: File,
  summary: DumpSummary,
  opts: ImportOptions,
  onProgress: (p: ImportProgress) => void,
): Promise<ImportReport> {
  const report: ImportReport = {
    created: 0,
    updated: 0,
    skipped: 0,
    failed: [],
    clicksImported: 0,
    clicksDuplicates: 0,
    clicksOrphans: 0,
    clicksInvalid: 0,
    totals: null,
  };
  const { domainId, ownerId, redirectType, onConflict, timeZone } = opts;

  // Links first: clicks need them to exist.
  const excluded = new Set<string>();
  for (let i = 0; i < summary.links.length; i += LINK_CHUNK) {
    onProgress({ phase: "links", done: i, total: summary.links.length });
    const chunk = summary.links.slice(i, i + LINK_CHUNK).map((l) => ({
      keyword: l.keyword,
      url: l.url.trim(),
      title: l.title?.trim() || null,
      createdAt: mysqlDateToMs(l.timestamp, timeZone),
      clicks: l.clicks,
    }));
    const r = await api<{ created: number; updated: number; skipped: number; skippedKeywords: string[]; failed: { keyword: string; error: string }[] }>(
      "/api/data/yourls/links",
      { body: { domainId, ownerId, redirectType, onConflict, links: chunk } },
    );
    report.created += r.created;
    report.updated += r.updated;
    report.skipped += r.skipped;
    report.failed.push(...r.failed);
    for (const k of r.skippedKeywords) excluded.add(k);
    for (const f of r.failed) excluded.add(f.keyword);
  }
  onProgress({ phase: "links", done: summary.links.length, total: summary.links.length });

  // Then the click history. Rows of links that were not imported are left out.
  const known = new Set(summary.links.map((l) => l.keyword));
  const total = summary.clickCount - summary.orphanClicks;
  let done = 0;
  onProgress({ phase: "clicks", done, total });
  await readDump(file, {
    onLog: async (rows) => {
      const send = [];
      for (const r of rows) {
        if (!known.has(r.shortUrl)) {
          report.clicksOrphans++;
          continue;
        }
        if (excluded.has(r.shortUrl)) continue;
        send.push({
          id: r.clickId,
          ts: mysqlDateToMs(r.clickTime, timeZone),
          shortUrl: r.shortUrl,
          referrer: r.referrer,
          userAgent: r.userAgent,
          ip: r.ip,
          country: r.country,
        });
      }
      if (send.length > 0) {
        const res = await api<{ inserted: number; duplicates: number; orphans: number; invalid: number }>("/api/data/yourls/clicks", {
          body: { domainId, rows: send },
        });
        report.clicksImported += res.inserted;
        report.clicksDuplicates += res.duplicates;
        report.clicksOrphans += res.orphans;
        report.clicksInvalid += res.invalid;
      }
      done += send.length;
      onProgress({ phase: "clicks", done: Math.min(done, total), total });
    },
  });

  report.totals = await api<ImportReport["totals"]>("/api/data/yourls/finish", {
    body: {
      domainId,
      summary: {
        file: file.name,
        prefix: summary.prefix,
        timeZone,
        onConflict,
        created: report.created,
        updated: report.updated,
        skipped: report.skipped,
        failed: report.failed.length,
        clicksImported: report.clicksImported,
        clicksDuplicates: report.clicksDuplicates,
        clicksOrphans: report.clicksOrphans,
      },
    },
  });
  return report;
}

/** Slugs of the dump that already exist on the domain. */
export async function findConflicts(domainId: string, links: YourlsUrlRow[]): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < links.length; i += 2000) {
    const { existing } = await api<{ existing: string[] }>("/api/data/yourls/conflicts", {
      body: { domainId, slugs: links.slice(i, i + 2000).map((l) => l.keyword) },
    });
    out.push(...existing);
  }
  return out;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
