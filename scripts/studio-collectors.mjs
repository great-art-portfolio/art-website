import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Studio sidecar support for /api/collectors (dev-only, never deployed).
 *
 * The sidecar answers with the REAL Pages Functions handler — no second
 * implementation to drift. This module only adapts the environment: a
 * localhost-forced mock flag, mail settings from .dev.vars, and a
 * file-backed stand-in for the D1 table the mock reads and writes.
 */

const COLLECTORS_CACHE_FILE = "studio-collectors.json";

/** Parse .dev.vars (KEY=VALUE, # comments, optional quotes). Missing file
 * means every secret reads blank — same as production without it. */
export function readDevVars(root) {
  let raw;
  try {
    raw = readFileSync(join(root, ".dev.vars"), "utf8");
  } catch {
    return {};
  }
  const out = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (key !== "") out[key] = value;
  }
  return out;
}

/** In-memory email_collectors table, persisted to the dev cache so a
 * sidecar restart doesn't wipe the loop mid-test. Matches the SQL shapes
 * functions/_lib/collectors-mock.ts issues — nothing else. */
export function createCollectorsDb(cacheDir) {
  const file = join(cacheDir, COLLECTORS_CACHE_FILE);
  let rows = new Map();
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    if (raw !== null && typeof raw === "object")
      rows = new Map(Object.entries(raw));
  } catch {
    // Fresh table — the cache is best-effort either way.
  }
  const save = () => {
    try {
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(file, JSON.stringify(Object.fromEntries(rows)));
    } catch {
      // Dev cache loss just restarts the loop; never fail a request.
    }
  };
  return {
    prepare: (sql) => ({
      bind: (...args) => ({
        run: async () => {
          const text = String(sql);
          if (text.startsWith("INSERT")) {
            const [email, token, , created] = args;
            const prev = rows.get(email);
            rows.set(email, {
              token,
              confirmed_at: prev?.confirmed_at ?? null,
              created_at: prev?.created_at ?? created,
            });
          } else if (text.startsWith("UPDATE")) {
            const [at, email] = args;
            const prev = rows.get(email);
            if (prev !== undefined)
              rows.set(email, { ...prev, confirmed_at: at });
          } else if (text.startsWith("DELETE")) {
            rows.delete(args[0]);
          }
          save();
          return {};
        },
        first: async () => {
          const text = String(sql);
          if (text.includes("COUNT(*)"))
            return {
              total: [...rows.values()].filter((r) => r.confirmed_at).length,
            };
          const row = rows.get(args[0]);
          return row === undefined ? null : { ...row };
        },
      }),
    }),
  };
}

/** Handler env: mock forced on (localhost-only anyway), mail settings
 * from .dev.vars. A real key plus a *@resend.dev address rides the true
 * Resend confirm; anything else (or no key) stays fully local. */
export function collectorsEnv(root, db) {
  const vars = readDevVars(root);
  return {
    COLLECTORS_MOCK: "true",
    RESEND_API_KEY: vars["RESEND_API_KEY"] ?? "",
    ARTIST_SENDER: vars["ARTIST_SENDER"] ?? "",
    ARTIST_INBOX: vars["ARTIST_INBOX"] ?? "",
    SITE_URL: "https://barbart.ca",
    DB: db,
  };
}
