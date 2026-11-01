import type { SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { SQLiteAsyncDialect } from "drizzle-orm/sqlite-core";
import type { DB } from "../platform/types";

/*
 * Many statements in one round trip. D1 sends them as a single batch (one subrequest instead of
 * one per statement). Each D1 batch is atomic; on SQLite the whole call runs in one transaction,
 * so a failure leaves nothing half written.
 * Keep every use of D1's batch API in this file.
 */

const STATEMENTS_PER_BATCH = 100;

/** Drizzle query builders (insert, update, delete) in one batch. */
export async function runBatch(db: DB, statements: BatchItem<"sqlite">[]): Promise<unknown[]> {
  if (statements.length === 0) return [];
  const withBatch = db as unknown as { batch?: (items: unknown[]) => Promise<unknown[]> };
  const out: unknown[] = [];
  if (typeof withBatch.batch === "function") {
    for (let i = 0; i < statements.length; i += STATEMENTS_PER_BATCH) {
      out.push(...(await withBatch.batch(statements.slice(i, i + STATEMENTS_PER_BATCH))));
    }
    return out;
  }
  // better-sqlite3: synchronous, so no other request can slip a statement in.
  (db as unknown as SyncDb).transaction(() => {
    for (const s of statements) {
      const q = s as unknown as { run(): unknown; all(): unknown[]; config?: { returning?: unknown } };
      out.push(q.config?.returning ? q.all() : q.run());
    }
  });
  return out;
}

type SyncDb = { transaction<T>(fn: () => T): T; run(query: SQL): unknown };

type D1Like = {
  prepare(sql: string): { bind(...values: unknown[]): unknown };
  batch(statements: unknown[]): Promise<unknown>;
};

const dialect = new SQLiteAsyncDialect();

/** Raw `sql` statements (built from `drizzle-orm`'s `sql` tag) in one batch. */
export async function runRawBatch(db: DB, statements: SQL[]): Promise<void> {
  if (statements.length === 0) return;
  const client = (db as unknown as { $client?: Partial<D1Like> }).$client;
  if (client && typeof client.batch === "function" && typeof client.prepare === "function") {
    const d1 = client as D1Like;
    for (let i = 0; i < statements.length; i += STATEMENTS_PER_BATCH) {
      const prepared = statements.slice(i, i + STATEMENTS_PER_BATCH).map((s) => {
        const q = dialect.sqlToQuery(s);
        return d1.prepare(q.sql).bind(...q.params);
      });
      await d1.batch(prepared);
    }
    return;
  }
  const sync = db as unknown as SyncDb;
  sync.transaction(() => {
    for (const s of statements) sync.run(s);
  });
}
