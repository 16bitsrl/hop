import { defineConfig, devices } from "@playwright/test";

export const APP = "http://app.localhost:8799";
/** Short domain used in tests; registered by the test fixtures. */
export const SHORT = "http://s.localhost:8799";

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
    command: "CLOUDFLARE_ENV=test pnpm exec vite dev",
    url: `${APP}/healthz`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
