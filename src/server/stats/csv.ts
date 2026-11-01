export type CsvCell = string | number | boolean | null | undefined;

function cell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  // Text that starts like a formula would run inside a spreadsheet: neutralise it.
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** RFC 4180 CSV with a BOM (so spreadsheets read UTF-8) and CRLF line ends. */
export function toCsv(rows: CsvCell[][]): string {
  return "﻿" + rows.map((r) => r.map(cell).join(",") + "\r\n").join("");
}
