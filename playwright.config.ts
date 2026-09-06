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
  // Pinned off 4321: another project on this machine owns that port, and
  // reuseExistingServer would silently run our suite against its server.
  use: { baseURL: "http://127.0.0.1:4331" },
  webServer: {
    command: "pnpm wrangler pages dev dist --port 4331 --ip 127.0.0.1",
    url: "http://127.0.0.1:4331/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
