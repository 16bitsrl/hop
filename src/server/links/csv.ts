import { detectDelimiter, parseCsv } from "../../shared/csv";
import { isHttpUrl } from "../redirect/destination";
import { isValidSlug } from "./slug";

/** CSV bulk create (A14): parsing and row checks that need no database. */

export const CSV_COLUMNS = ["url", "slug", "title", "tags", "folder", "notes", "domain"] as const;
export const MAX_CSV_ROWS = 500;
/** Rows (and ids) per request that writes: one D1 invocation allows only so many queries. */
export const MAX_BATCH = 25;

export { parseCsv };

export type CsvRow = {
  /** Line number in the file (the header is line 1). */
  line: number;
  url: string;
  slug: string;
  title: string;
  tags: string[];
  folder: string;
  notes: string;
  domain: string;
  errors: string[];
};

export type CsvParseResult = { rows: CsvRow[]; error?: "csv_empty" | "csv_missing_url" | "csv_too_many_rows" };

/** Splits a tags cell on ",", ";" or "|". */
export const splitTags = (value: string): string[] =>
  [...new Set(value.split(/[,;|]/).map((t) => t.trim()).filter(Boolean))];

/** Reads the header, maps columns by name (any order), and runs the checks that need no database. */
export function readCsvRows(text: string): CsvParseResult {
  const table = parseCsv(text, detectDelimiter(text));
  if (table.length === 0) return { rows: [], error: "csv_empty" };
  const header = table[0]!.map((h) => h.trim().toLowerCase());
  const col = Object.fromEntries(CSV_COLUMNS.map((name) => [name, header.indexOf(name)])) as Record<(typeof CSV_COLUMNS)[number], number>;
  if (col.url < 0) return { rows: [], error: "csv_missing_url" };
  if (table.length - 1 > MAX_CSV_ROWS) return { rows: [], error: "csv_too_many_rows" };

  const rows: CsvRow[] = table.slice(1).map((cells, i) => {
    const get = (name: (typeof CSV_COLUMNS)[number]) => (col[name] >= 0 ? (cells[col[name]] ?? "").trim() : "");
    const row: CsvRow = {
      line: i + 2,
      url: get("url"),
      slug: get("slug"),
      title: get("title"),
      tags: splitTags(get("tags")),
      folder: get("folder"),
      notes: get("notes"),
      domain: get("domain").toLowerCase(),
      errors: [],
    };
    if (!isHttpUrl(row.url)) row.errors.push("invalid_url");
    if (row.slug && !isValidSlug(row.slug)) row.errors.push("invalid_slug");
    return row;
  });

  // Same slug twice on the same domain in one file: the later rows are the duplicates.
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.slug || row.errors.includes("invalid_slug")) continue;
    const key = `${row.domain}\u0000${row.slug}`;
    if (seen.has(key)) row.errors.push("slug_duplicate");
    seen.add(key);
  }
  return { rows };
}

/** Template offered for download in the import dialog. */
export const CSV_TEMPLATE =
  "url,slug,title,tags,folder,notes,domain\n" +
  'https://example.com/spring-sale,spring,Spring sale,"promo;newsletter",Campaigns,Shown in the March email,\n';
