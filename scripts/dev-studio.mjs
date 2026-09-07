/**
 * `pnpm dev:studio`: the studio dev loop — astro dev (live source, real
 * file writes) on :4332 plus the local content API on :4333, which the
 * astro dev proxy answers /api/* from. One process to stop (Ctrl-C kills
 * both). 4331 stays the built review stand; 4321 stays out (owned by
 * another project on this machine).
 */
import { spawn } from "node:child_process";

export const STUDIO_DEV_PORT = 4332;

const children = new Set();

function run(cmd, args, label) {
  const child = spawn(cmd, args, { stdio: "inherit" });
  children.add(child);
  child.on("exit", (code, signal) => {
    children.delete(child);
    if (children.size === 0) {
      process.exit(typeof code === "number" ? code : 0);
    } else {
      console.error(
        `[${label}] exited (${signal ?? code}) — stopping the studio.`,
      );
      shutdown();
    }
  });
  return child;
}

function shutdown() {
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      // Already gone.
    }
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("Studio dev loop:");
console.log(`  site: http://127.0.0.1:${STUDIO_DEV_PORT}/admin`);
console.log("  writes land uncommitted — reset with `pnpm studio:reset`.");
run(process.execPath, ["scripts/studio-dev-server.mjs"], "content-api");
run(
  "pnpm",
  ["astro", "dev", "--port", String(STUDIO_DEV_PORT), "--host", "127.0.0.1"],
  "astro",
);
