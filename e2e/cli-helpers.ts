import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Helpers to drive the command line app (cli/) like a person at a terminal would:
 *
 *   const hop = cli();                              // its own, empty settings folder
 *   const r = hop.run("create", "https://example.com");   // { code, stdout, stderr }
 *   const login = hop.start("login", APP);          // for commands that wait: login.waitFor(/…/), login.done
 */

export const goAvailable = spawnSync("go", ["version"]).status === 0;

const built = new Map<string, string>();

/** Builds the app once per version and returns the path of the program. */
export function buildCli(version = "0.1.0"): string {
  let bin = built.get(version);
  if (!bin) {
    bin = path.join(mkdtempSync(path.join(tmpdir(), "hop-cli-")), process.platform === "win32" ? "hop.exe" : "hop");
    execFileSync("go", ["build", "-ldflags", `-X main.version=${version}`, "-o", bin, "."], { cwd: "cli", stdio: "inherit" });
    built.set(version, bin);
  }
  return bin;
}

/** Starts one of the stand-in servers of e2e/fixtures/cli-servers.mjs; resolves with its port once it listens. */
export function standIn(kind: "hop" | "files", arg: string): Promise<{ port: number; stop: () => void }> {
  // Without the test runner's own Node options, which do not belong in a plain script.
  const { NODE_OPTIONS: _ignored, ...env } = process.env;
  const child = spawn(process.execPath, ["e2e/fixtures/cli-servers.mjs", kind, arg], { env, stdio: ["ignore", "pipe", "inherit"] });
  return new Promise((resolve, reject) => {
    let printed = "";
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`the stand-in server stopped (${code}) after printing: ${printed}`)));
    child.stdout.on("data", (d) => {
      printed += d;
      const m = printed.match(/^(\d+)$/m);
      if (m) resolve({ port: Number(m[1]), stop: () => child.kill() });
    });
  });
}

export type Result = { code: number; stdout: string; stderr: string };

export function cli(opts: { bin?: string; env?: Record<string, string> } = {}) {
  const bin = opts.bin ?? buildCli();
  const configDir = mkdtempSync(path.join(tmpdir(), "hop-cli-config-"));
  const env = {
    ...process.env,
    HOP_CONFIG_DIR: configDir,
    HOP_NO_KEYRING: "1", // never touch the real keychain
    HOP_NO_BROWSER: "1", // never open the real browser
    HOP_NO_UPDATE_CHECK: "1",
    HOP_LANG: "en",
    HOP_SERVER: "",
    HOP_TOKEN: "",
    TZ: "UTC",
    ...opts.env,
  };
  return {
    configDir,
    run(...args: string[]): Result {
      const r = spawnSync(bin, args, { env, encoding: "utf8", timeout: 60_000 });
      return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
    },
    /** Like run, with text sent to the standard input. */
    runWithInput(input: string, ...args: string[]): Result {
      const r = spawnSync(bin, args, { env, encoding: "utf8", timeout: 60_000, input });
      return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
    },
    with(extra: Record<string, string>) {
      return {
        run: (...args: string[]): Result => {
          const r = spawnSync(bin, args, { env: { ...env, ...extra }, encoding: "utf8", timeout: 60_000 });
          return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
        },
      };
    },
    start(...args: string[]) {
      const child = spawn(bin, args, { env });
      let output = "";
      child.stdout.on("data", (d) => (output += d));
      child.stderr.on("data", (d) => (output += d));
      const done = new Promise<number>((resolve) => child.on("close", (code) => resolve(code ?? -1)));
      return {
        done,
        output: () => output,
        kill: () => child.kill(),
        async waitFor(pattern: RegExp, timeoutMs = 15_000): Promise<RegExpMatchArray> {
          const until = Date.now() + timeoutMs;
          for (;;) {
            const m = output.match(pattern);
            if (m) return m;
            if (Date.now() > until) throw new Error(`the app never printed ${pattern}; it printed:\n${output}`);
            await new Promise((r) => setTimeout(r, 50));
          }
        },
      };
    },
  };
}
