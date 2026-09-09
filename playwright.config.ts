import { defineConfig } from "@playwright/test";

// Serves the built site through the real Pages runtime (static pages +
// Functions, dummy localhost bindings), so API validation paths and the
// full email flow are exercised exactly as production serves them — the
// email-list spec points RESEND_API_BASE at its own in-spec mock server,
// so zero live calls go out. The key/segment below are dummies, not
// secrets: without them the list endpoints take their 500 branch.
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
    command:
      "pnpm wrangler pages dev dist --port 4331 --ip 127.0.0.1 -b RESEND_API_KEY=e2e-dummy -b RESEND_SEGMENT_ID=e2e-seg -b RESEND_API_BASE=http://127.0.0.1:4499",
    url: "http://127.0.0.1:4331/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
