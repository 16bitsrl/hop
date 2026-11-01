import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { expect, test } from "vitest";
import { tags } from "../db/schema";
import { createNodeRuntime } from "../platform/node";
import { parseNodeEnv } from "../platform/node-config";
import { runBatch, runRawBatch } from "./batch";

// A failed batch must leave nothing behind, on Node as on D1, so a restore chunk can be retried.
test("a batch that fails halfway writes nothing on Node", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hop-batch-"));
  const runtime = await createNodeRuntime(
    parseNodeEnv({
      APP_HOST: "app.localhost:1",
      APP_URL: "http://app.localhost:1",
      AUTH_SECRET: "test-secret-test-secret-test-secret-123",
      DATA_DIR: dir,
      MIGRATIONS_DIR: join(process.cwd(), "migrations"),
    }),
  );
  const { db } = runtime.platform;
  const count = async () => (await db.all<{ n: number }>(sql`select count(*) as n from "tags"`))[0]!.n;
  try {
    const raw = runRawBatch(db, [
      sql`insert into "tags" ("id", "name") values ('t1', 'one')`,
      sql`insert into "links" ("id", "domain_id", "slug", "url") values ('l1', 'missing', 's', 'https://example.com')`,
    ]);
    await expect(raw).rejects.toThrow();
    expect(await count()).toBe(0);

    const built = runBatch(db, [db.insert(tags).values({ id: "t2", name: "two" }), db.insert(tags).values({ id: "t3", name: "two" })]);
    await expect(built).rejects.toThrow();
    expect(await count()).toBe(0);
  } finally {
    await runtime.close();
    await rm(dir, { recursive: true, force: true });
  }
});
