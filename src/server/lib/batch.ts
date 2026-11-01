import type { BatchItem } from "drizzle-orm/batch";
import type { DB } from "../platform/types";

/**
 * Runs many statements in one round trip. D1 sends them as a single batch (one subrequest);
 * runtimes without `batch` run them one after the other. Keep every use of `db.batch` here.
 */
export async function runBatch(db: DB, statements: BatchItem<"sqlite">[]): Promise<unknown[]> {
  if (statements.length === 0) return [];
  const withBatch = db as unknown as { batch?: (items: unknown[]) => Promise<unknown[]> };
  const out: unknown[] = [];
  if (typeof withBatch.batch === "function") {
    // Stay well below the statement limits of a single D1 batch.
    for (let i = 0; i < statements.length; i += 100) out.push(...(await withBatch.batch(statements.slice(i, i + 100))));
    return out;
  }
  for (const s of statements) out.push(await s);
  return out;
}
