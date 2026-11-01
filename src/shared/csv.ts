/** CSV reading shared by the server (import) and the browser (splitting a big file into batches). */

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

/** "," or ";", whichever the header line uses more. */
export function detectDelimiter(text: string): string {
  const firstLine = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  return (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
}

const quote = (cell: string) => (/[",;\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell);

/**
 * Cuts a CSV file into files of at most `size` data rows, each with the header. `lineOffset` is how many
 * data rows came before the batch, so line numbers in a report can point at the original file.
 */
export function splitCsv(text: string, size: number): { csv: string; lineOffset: number }[] {
  const table = parseCsv(text, detectDelimiter(text));
  if (table.length <= 1) return [{ csv: text, lineOffset: 0 }];
  const [header, ...rows] = table as [string[], ...string[][]];
  const out: { csv: string; lineOffset: number }[] = [];
  for (let i = 0; i < rows.length; i += size) {
    const lines = [header, ...rows.slice(i, i + size)].map((r) => r.map(quote).join(","));
    out.push({ csv: lines.join("\r\n") + "\r\n", lineOffset: i });
  }
  return out;
}
