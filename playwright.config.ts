import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.HOP_TEST_PORT ?? 8799);
export const APP = `http://app.localhost:${port}`;
/** Short domain used in tests; registered by the test fixtures. */
export const SHORT = `http://s.localhost:${port}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: APP, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // HOP_RUNTIME=node runs the same suite against the Node/SQLite build; the default is Workers.
    command:
      process.env.HOP_RUNTIME === "node"
        ? `pnpm build:node && HOP_TEST_PORT=${port} node e2e/start-node.mjs`
        : `node e2e/prepare-db.mjs && CLOUDFLARE_ENV=test HOP_TEST_PORT=${port} pnpm exec vite dev`,
    url: `${APP}/healthz`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
