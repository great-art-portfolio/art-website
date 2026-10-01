// @ts-check
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  // Production origin, used for absolute share and sitemap URLs.
  site: "https://barbart.ca",
  image: {
    // The stock sharp service drops embedded ICC profiles, and most painting
    // photos are Display P3. This one keeps them.
    service: { entrypoint: "./src/lib/image-service.ts" },
  },
  vite: {
    optimizeDeps: {
      // qrcode-generator's ESM build makes the dev pre-bundler return 504s.
      // Serve it unbundled in dev. The production build is unaffected.
      exclude: ["qrcode-generator"],
    },
    server: {
      // For `pnpm dev:studio`: the local content API serves /api/* from the
      // working tree. This only affects the dev server. With the API
      // stopped, the client falls back to practice mode.
      proxy: {
        "/api": "http://127.0.0.1:4333",
      },
    },
  },
});
