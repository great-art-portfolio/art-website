// @ts-check
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  // Live origin: feeds absolute share/sitemap addresses at build time.
  site: "https://barbart.ca",
  image: {
    // Stock sharp drops embedded ICC profiles; five of seven painting
    // photos are Display P3. Ours keeps them (see src/lib/image-service).
    service: { entrypoint: "./src/lib/image-service.ts" },
  },
  vite: {
    optimizeDeps: {
      // qrcode-generator's ESM build trips the dev pre-bundler (504s),
      // which used to take the whole admin panel down with it. Serve it
      // natively instead — the build is unaffected.
      exclude: ["qrcode-generator"],
    },
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
