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

export default defineConfig({
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
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api(\/|$)/, /^\/media(\/|$)/, /^\/healthz$/, /^\/metrics$/],
        cleanupOutdatedCaches: true,
        // No runtime caching rules: everything that is not precached goes straight to the network.
      },
      devOptions: { enabled: true, type: "module", navigateFallbackAllowlist: [/^\/(?!api\/|media\/|healthz|metrics)/] },
    }),
    cloudflare({
      persistState: isTest ? { path: ".test-state" } : true,
      config: isTest
        ? { vars: { APP_HOST: `app.localhost:${port}`, APP_URL: `http://app.localhost:${port}` } }
        : undefined,
    }),
  ],
  server: { port, strictPort: true, allowedHosts: [".localhost"] },
});
