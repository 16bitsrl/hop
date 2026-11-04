import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";
import { sql, type SQL } from "drizzle-orm";
import {
  account,
  apiKeys,
  auditLog,
  blockedDomains,
  clicks,
  domains,
  folders,
  invites,
  linkTags,
  links,
  passkey,
  settings,
  tags,
  user,
} from "../db/schema";
import type { DB } from "../platform/types";

/**
 * Backup format: NDJSON, one JSON object per line.
 *   {"format":"hop-backup","version":1,"createdAt":<ms>,"tables":[...]}
 *   {"t":"<table>","r":{<column name>: value, ...}}      one per row, parents before children
 *   {"end":true,"counts":{"<table>": <rows>, ...},"skipped":{...}}   lets a restore notice a cut-off file
 * Rows hold the raw database values (timestamps in milliseconds, JSON columns as text).
 * Sessions and verification codes are not part of a backup.
 */

export const BACKUP_FORMAT = "hop-backup";
export const BACKUP_VERSION = 1;

/** Parents first, so a restore can insert in file order. */
export const BACKUP_TABLES: { name: string; table: SQLiteTable }[] = [
  domains,
  user,
  account,
  passkey,
  settings,
  folders,
  tags,
  links,
  linkTags,
  clicks,
  auditLog,
  apiKeys,
  blockedDomains,
  invites,
].map((table) => ({ name: getTableConfig(table).name, table }));

const columnNames = new Map(BACKUP_TABLES.map((t) => [t.name, new Set(getTableConfig(t.table).columns.map((c) => c.name))]));

export const isBackupTable = (name: string) => columnNames.has(name);
export const isBackupColumn = (table: string, column: string) => columnNames.get(table)?.has(column) ?? false;

/** For each table, its references to other tables in the backup. */
const references = new Map(
  BACKUP_TABLES.map(({ name, table }) => [
    name,
    getTableConfig(table).foreignKeys.map((fk) => {
      const r = fk.reference();
      return { column: r.columns[0]!.name, parent: getTableConfig(r.foreignTable).name, required: r.columns[0]!.notNull };
    }),
  ]),
);
const referenced = new Set([...references.values()].flat().map((r) => r.parent));

type Row = Record<string, unknown>;

/**
 * Tables are read one after the other while the app keeps running, so a row can point to one created after
 * its table was read. The backup stays consistent with how things were when it started: a row whose required
 * parent is not in the file is left out (it was created during the backup), an optional reference to such a
 * row is cleared. Only valid because parents are written before their children.
 */
export function consistencyFilter() {
  const seen = new Map<string, Set<unknown>>();
  const skipped: Record<string, number> = {};
  const keep = (table: string, row: Row): Row | null => {
    let out = row;
    for (const ref of references.get(table) ?? []) {
      const value = row[ref.column];
      if (value === null || value === undefined || seen.get(ref.parent)?.has(value)) continue;
      if (ref.required) {
        skipped[table] = (skipped[table] ?? 0) + 1;
        return null;
      }
      out = { ...out, [ref.column]: null };
    }
    if (referenced.has(table)) {
      if (!seen.has(table)) seen.set(table, new Set());
      seen.get(table)!.add(out.id);
    }
    return out;
  };
  return Object.assign(keep, { skipped });
}

const PAGE = 500;
const encoder = new TextEncoder();

/** Streams the whole installation as NDJSON text. Pages through each table by rowid. */
export function backupStream(db: DB, now = Date.now()): ReadableStream<Uint8Array> {
  let step = -1; // -1 = header, 0..n-1 = tables, n = footer
  let after = 0;
  const counts: Record<string, number> = {};
  const keep = consistencyFilter();
  const line = (value: unknown) => `${JSON.stringify(value)}\n`;

  return new ReadableStream<Uint8Array>({
    // A pull must enqueue something (or close), otherwise the stream is never pulled again.
    async pull(controller) {
      for (;;) {
        if (step === -1) {
          controller.enqueue(encoder.encode(line({ format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: now, tables: BACKUP_TABLES.map((t) => t.name) })));
          step = 0;
          return;
        }
        if (step >= BACKUP_TABLES.length) {
          controller.enqueue(encoder.encode(line({ end: true, counts, skipped: keep.skipped })));
          controller.close();
          return;
        }
        const name = BACKUP_TABLES[step]!.name;
        const rows = await db.all<Row>(
          sql`select rowid as "__rid", * from ${sql.identifier(name)} where rowid > ${after} order by rowid limit ${PAGE}`,
        );
        if (rows.length === 0) {
          step++;
          after = 0;
          continue;
        }
        let text = "";
        let written = 0;
        for (const { __rid, ...row } of rows) {
          after = Number(__rid);
          const r = keep(name, row);
          if (!r) continue;
          text += line({ t: name, r });
          written++;
        }
        counts[name] = (counts[name] ?? 0) + written;
        // Every row of this page may have been left out: read the next page instead of sending nothing.
        if (!text) continue;
        controller.enqueue(encoder.encode(text));
        return;
      }
    },
  });
}

/* ------------------------------------------------------------------ */
/* Restore                                                             */
/* ------------------------------------------------------------------ */

export type BackupRow = { t: string; r: Record<string, string | number | null> };

/** Checks a chunk of rows: known tables and columns, plain values only. Returns the first problem or null. */
export function validateRows(rows: BackupRow[]): string | null {
  for (const row of rows) {
    if (!row || typeof row.t !== "string" || !isBackupTable(row.t) || typeof row.r !== "object" || row.r === null) return "invalid_backup";
    const keys = Object.keys(row.r);
    if (keys.length === 0) return "invalid_backup";
    for (const k of keys) {
      const v = row.r[k];
      if (!isBackupColumn(row.t, k) || !(v === null || typeof v === "string" || typeof v === "number")) return "invalid_backup";
    }
  }
  return null;
}

/** Multi-row INSERT statements, grouped by table and column set (D1 allows 100 bound values per statement). */
export function insertStatements(rows: BackupRow[]): SQL[] {
  const statements: SQL[] = [];
  let i = 0;
  while (i < rows.length) {
    const first = rows[i]!;
    const cols = Object.keys(first.r).sort();
    const key = `${first.t}|${cols.join(",")}`;
    const perStatement = Math.max(1, Math.floor(90 / cols.length));
    const group: BackupRow[] = [];
    while (i < rows.length && group.length < perStatement) {
      const next = rows[i]!;
      if (`${next.t}|${Object.keys(next.r).sort().join(",")}` !== key) break;
      group.push(next);
      i++;
    }
    const colSql = sql.join(
      cols.map((c) => sql.identifier(c)),
      sql`, `,
    );
    const valuesSql = sql.join(
      group.map((g) => sql`(${sql.join(cols.map((c) => sql`${g.r[c]}`), sql`, `)})`),
      sql`, `,
    );
    statements.push(sql`insert into ${sql.identifier(first.t)} (${colSql}) values ${valuesSql}`);
  }
  return statements;
}

/** Row counts of every backup table. */
export async function tableCounts(db: DB): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const { name } of BACKUP_TABLES) {
    const [row] = await db.all<{ n: number }>(sql`select count(*) as n from ${sql.identifier(name)}`);
    out[name] = row?.n ?? 0;
  }
  return out;
}
