/**
 * `pnpm dev:studio`: the studio dev loop — astro dev (live source, real
 * file writes) on :4332 plus the local content API on :4333, which the
 * astro dev proxy answers /api/* from. One process to stop (Ctrl-C kills
 * both). 4331 stays the built review stand; 4321 stays out (owned by
 * another project on this machine).
 */
import { spawn } from "node:child_process";

export const STUDIO_DEV_PORT = 4332;
const STUDIO_DEV_API = "http://127.0.0.1:4333";

/**
 * Anything already serving here — mine, a leftover, the user's own — is
 * reused. Rebinding would just crash with EADDRINUSE and take the other
 * half of the loop down with it.
 */
async function contentApiAlive() {
  try {
    const res = await fetch(`${STUDIO_DEV_API}/api/studio-dev`);
    return res.ok && (await res.json()).local === true;
  } catch {
    return false;
  }
}

async function astroAlive() {
  try {
    const res = await fetch(`http://127.0.0.1:${STUDIO_DEV_PORT}/`);
    return res.ok;
  } catch {
    return false;
  }
}

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

async function main() {
  console.log("Studio dev loop:");
  console.log(`  site: http://127.0.0.1:${STUDIO_DEV_PORT}/admin`);
  console.log("  writes land uncommitted — reset with `pnpm studio:reset`.");
  if (await contentApiAlive()) {
    console.log("  content API already running — reusing it.");
  } else {
    // The extension hook lets the sidecar import the real Functions
    // handlers (TypeScript, extensionless) instead of reimplementing them.
    run(
      process.execPath,
      [
        "--import",
        "./tests/unit/register-loader.mjs",
        "scripts/studio-dev-server.mjs",
      ],
      "content-api",
    );
  }
  if (await astroAlive()) {
    console.log("  site already running — reusing it.");
    if (children.size === 0) return;
  } else {
    run(
      "pnpm",
      [
        "astro",
        "dev",
        "--port",
        String(STUDIO_DEV_PORT),
        "--host",
        "127.0.0.1",
      ],
      "astro",
    );
  }
}

main();
