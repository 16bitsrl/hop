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
  use: { baseURL: APP, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Playwright starts the web server before globalSetup, so the fresh DB must be created here.
    command: `rm -rf .test-state && pnpm exec wrangler d1 migrations apply DB --local --env test --persist-to .test-state > /dev/null && CLOUDFLARE_ENV=test HOP_TEST_PORT=${port} pnpm exec vite dev`,
    url: `${APP}/healthz`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
