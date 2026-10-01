import { defineConfig } from "@playwright/test";

// Serves the built site through the Pages runtime, static pages and
// Functions, without secrets.
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  // wrangler pages dev sometimes drops the first navigation while the
  // worker is still starting.
  retries: 1,
  // Not 4321: another project uses that port, and reuseExistingServer would
  // run the suite against it.
  use: { baseURL: "http://127.0.0.1:4331" },
  webServer: {
    command: "pnpm wrangler pages dev dist --port 4331 --ip 127.0.0.1",
    url: "http://127.0.0.1:4331/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
