import { isHttpUrl } from "../redirect/destination";
import { isValidSlug } from "./slug";

/** CSV bulk create (A14): parsing and row checks that need no database. */

export const CSV_COLUMNS = ["url", "slug", "title", "tags", "folder", "notes", "domain"] as const;
export const MAX_CSV_ROWS = 500;

/** RFC 4180 parser: quoted fields, doubled quotes, CRLF, BOM. `delimiter` is "," or ";". */
export function parseCsv(text: string, delimiter: string = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

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
  const firstLine = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const table = parseCsv(text, delimiter);
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
