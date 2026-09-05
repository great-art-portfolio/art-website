import { defineConfig } from "@playwright/test";

// Serves the built site through the real Pages runtime (static pages +
// Functions, no secrets), so API validation paths and graceful fallbacks
// are exercised exactly as production serves them.
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  // One retry: wrangler pages dev occasionally severs the very first
  // navigation while the worker finishes cold-booting.
  retries: 1,
  use: { baseURL: "http://127.0.0.1:4321" },
  webServer: {
    command: "pnpm wrangler pages dev dist --port 4321 --ip 127.0.0.1",
    url: "http://127.0.0.1:4321/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
