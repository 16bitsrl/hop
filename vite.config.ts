import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const isTest = process.env.CLOUDFLARE_ENV === "test";
/** Tests can run in several checkouts at once: each picks its own port. */
const port = isTest ? Number(process.env.HOP_TEST_PORT ?? 8799) : 5173;

/**
 * The PWA plugin answers its dev files (manifest, worker) on every host. Only the app host may
 * have them, like in production, where short domains are handled by the redirect code alone.
 */
function appHostOnlyPwaFiles(appHost: string): Plugin {
  const files = /^\/(manifest\.webmanifest|dev-sw\.js|registerSW\.js)(\?|$)/;
  return {
    name: "hop:pwa-app-host-only",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (files.test(req.url ?? "") && req.headers.host !== appHost) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [
    appHostOnlyPwaFiles(isTest ? `app.localhost:${port}` : "app.localhost:5173"),
    react(),
    tailwindcss(),
    // Installable app. The worker caches only the admin app shell and its static files; the server
    // never serves the SPA (nor the manifest) on a short domain, so nothing registers there.
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      manifestFilename: "manifest.webmanifest",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "hop",
        short_name: "hop",
        description: "Short links you own",
        id: "/",
        start_url: "/links",
        scope: "/",
        display: "standalone",
        background_color: "#f7f7f5",
        theme_color: "#0f7a5c",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
        ],
        // Android share sheet: GET /links?share=<url> opens the create dialog pre-filled.
        share_target: { action: "/links", method: "GET", params: { title: "title", text: "text", url: "share" } },
      } as never,
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        cleanupOutdatedCaches: true,
        // The plugin serves a saved index.html for every page unless told not to, "/" included.
        navigateFallback: null,
        directoryIndex: null,
        // Pages always come from the server, so a new release shows on the next normal load. When the network
        // does not answer, the precached index.html of the installed release opens instead: it matches the
        // precached scripts and styles, while a saved copy of a single page could point to deleted ones.
        // Nothing else is cached: /api, /media, /healthz and /metrics always go to the network.
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) => request.mode === "navigate" && !/^\/(api|media|healthz|metrics)(\/|$)/.test(url.pathname),
            handler: "NetworkOnly",
            options: {
              plugins: [
                {
                  handlerDidError: async () => (await caches.match("/index.html", { ignoreSearch: true })) ?? Response.error(),
                },
              ],
            },
          },
        ],
      },
      devOptions: { enabled: true, type: "module", navigateFallbackAllowlist: [/^\/(?!api\/|media\/|healthz|metrics)/] },
    }),
    cloudflare({
      // Your own deployments can live in a config file kept out of git, e.g. HOP_WRANGLER_CONFIG=wrangler.deploy.jsonc.
      configPath: process.env.HOP_WRANGLER_CONFIG,
      persistState: isTest ? { path: ".test-state" } : true,
      // Deployments set APP_HOST and APP_URL as secrets; the dev server and the tests use local hosts.
      config:
        command === "serve"
          ? { vars: { APP_HOST: `app.localhost:${port}`, APP_URL: `http://app.localhost:${port}` } }
          : undefined,
    }),
  ],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src/web") } },
  server: { port, strictPort: true, allowedHosts: [".localhost"] },
}));
