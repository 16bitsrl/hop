// Bundles the Node entry into dist/node/server.mjs. The SPA comes from `vite build` (dist/client).
// better-sqlite3 is native and stays external: install it next to the bundle (see Dockerfile).
import { build } from "esbuild";

await build({
  entryPoints: ["src/server/node.ts"],
  outfile: "dist/node/server.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  external: ["better-sqlite3"],
  sourcemap: true,
  logLevel: "info",
  // Some bundled dependencies are CommonJS and call require().
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});
