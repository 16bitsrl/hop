import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { expect, test } from "vitest";
import { createApp } from "../app";
import { createNodeRuntime } from "../platform/node";
import { parseNodeEnv } from "../platform/node-config";

// Concurrency on a fresh installation needs a real empty database, so this runs the Node runtime on a temp folder.
test("concurrent first-run setups create exactly one admin", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hop-setup-race-"));
  const runtime = await createNodeRuntime(
    parseNodeEnv({
      APP_HOST: "app.localhost:1",
      APP_URL: "http://app.localhost:1",
      AUTH_SECRET: "test-secret-test-secret-test-secret-123",
      DATA_DIR: dir,
      MIGRATIONS_DIR: join(process.cwd(), "migrations"),
    }),
  );
  try {
    const app = createApp({ platform: () => runtime.platform, serveAssets: async () => new Response("") });
    const statuses = await Promise.all(
      [0, 1, 2].map(async (n) => {
        const res = await app.fetch(
          new Request("http://app.localhost:1/api/setup", {
            method: "POST",
            headers: { "content-type": "application/json", origin: "http://app.localhost:1" },
            body: JSON.stringify({ email: `race${n}@example.test`, name: `Race ${n}`, password: "test-password-123" }),
          }),
        );
        return res.status;
      }),
    );
    expect(statuses.sort()).toEqual([200, 409, 409]);
    const users = await runtime.platform.db.all<{ n: number }>(sql`select count(*) as n from "user"`);
    const accounts = await runtime.platform.db.all<{ n: number }>(sql`select count(*) as n from "account"`);
    expect([users[0]!.n, accounts[0]!.n]).toEqual([1, 1]);
  } finally {
    await runtime.close();
    await rm(dir, { recursive: true, force: true });
  }
}, 30_000);
