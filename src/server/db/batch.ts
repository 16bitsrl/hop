import type { BatchItem } from "drizzle-orm/batch";
import type { DB } from "../platform/types";

type SyncQuery = { run(): unknown };
type SyncDb = { transaction<T>(fn: () => T): T };

/**
 * Runs several writes atomically. D1 has no transactions but batches are atomic; better-sqlite3 has
 * no `batch`, so the same queries run inside one transaction (synchronously, so no other request
 * can slip a statement into it). Build the queries from `db`, as you would for `db.batch`.
 */
export async function runBatch(db: DB, queries: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]): Promise<void> {
  if (typeof db.batch === "function") {
    await db.batch(queries);
    return;
  }
  (db as unknown as SyncDb).transaction(() => {
    for (const q of queries) (q as unknown as SyncQuery).run();
  });
}
