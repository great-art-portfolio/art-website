// @ts-check
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  // Live origin: feeds absolute share/sitemap addresses at build time.
  site: "https://barbart.ca",
  vite: {
    server: {
      // Studio dev loop only (`pnpm dev:studio`): the local content API
      // answers /api/* from the working tree. Dev-server-only — the
      // static build and the 4331 review stand are unaffected, and with
      // the sidecar stopped the client falls back to practice mode.
      proxy: {
        "/api": "http://127.0.0.1:4333",
      },
    },
  },
});
