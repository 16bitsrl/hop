import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const isTest = process.env.CLOUDFLARE_ENV === "test";
/** Tests can run in several checkouts at once: each picks its own port. */
const port = isTest ? Number(process.env.HOP_TEST_PORT ?? 8799) : 5173;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({
      persistState: isTest ? { path: ".test-state" } : true,
      config: isTest
        ? { vars: { APP_HOST: `app.localhost:${port}`, APP_URL: `http://app.localhost:${port}` } }
        : undefined,
    }),
  ],
  server: { port, strictPort: true, allowedHosts: [".localhost"] },
});
