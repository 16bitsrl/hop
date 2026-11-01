import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const isTest = process.env.CLOUDFLARE_ENV === "test";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({ persistState: isTest ? { path: ".test-state" } : true }),
  ],
  server: {
    port: isTest ? 8799 : 5173,
    strictPort: true,
    allowedHosts: [".localhost"],
  },
});
