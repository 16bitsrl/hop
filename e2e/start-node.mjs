// Starts the Node build of hop for the E2E suite (HOP_RUNTIME=node), on a fresh SQLite file in a
// dedicated directory. Never touches any other database. Run `pnpm build:node` first.
import { mkdirSync, rmSync } from "node:fs";

const port = process.env.HOP_TEST_PORT ?? "8799";
const dataDir = ".test-state-node";

rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });

Object.assign(process.env, {
  DATA_DIR: dataDir,
  PORT: port,
  APP_HOST: `app.localhost:${port}`,
  APP_URL: `http://app.localhost:${port}`,
  AUTH_SECRET: "test-secret-test-secret-test-secret-123",
  METRICS_TOKEN: "test-metrics-token",
  SETUP_TOKEN: "test-setup-token",
  TEST_MODE: "1",
});

await import("../dist/node/server.mjs");
