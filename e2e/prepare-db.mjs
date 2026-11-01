// Fresh, dedicated test database for every run. Never touches dev data.
// Runs as part of the webServer command: Playwright starts the web server BEFORE globalSetup,
// so resetting the files in globalSetup would pull them from under the running server.
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

rmSync(".test-state", { recursive: true, force: true });
execSync("pnpm exec wrangler d1 migrations apply DB --local --env test --persist-to .test-state", {
  stdio: "inherit",
});
