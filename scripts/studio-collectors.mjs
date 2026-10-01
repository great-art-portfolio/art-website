import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Dev-only support for /api/collectors in the local content API.
 *
 * Requests go to the real Pages Functions handler. This module only
 * supplies its environment: the mock flag, mail settings from .dev.vars,
 * and a file-backed stand-in for the D1 table.
 */

const COLLECTORS_CACHE_FILE = "studio-collectors.json";

/** Parses .dev.vars (KEY=VALUE, # comments, optional quotes). A missing
 * file leaves every secret blank. */
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
 * restart doesn't lose state. Supports only the SQL that
 * functions/_lib/collectors-mock.ts issues. */
export function createCollectorsDb(cacheDir) {
  const file = join(cacheDir, COLLECTORS_CACHE_FILE);
  let rows = new Map();
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    if (raw !== null && typeof raw === "object")
      rows = new Map(Object.entries(raw));
  } catch {
    // Start with an empty table. The cache is best-effort.
  }
  const save = () => {
    try {
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(file, JSON.stringify(Object.fromEntries(rows)));
    } catch {
      // Losing the dev cache is harmless, so don't fail the request.
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

/** Browser-facing origin for the dev confirm link. The proxy rewrites the
 * host to the API's own port (:4333, which serves no pages), so keep the
 * hostname and point the port back at the site. */
export function siteOriginFor(hostHeader) {
  const hostname =
    typeof hostHeader === "string" && hostHeader !== ""
      ? hostHeader.split(":")[0] || "127.0.0.1"
      : "127.0.0.1";
  return `http://${hostname}:4332`;
}

/** Handler env with the mock forced on and mail settings from .dev.vars.
 * With a real key, *@resend.dev addresses also get a real Resend confirm.
 * Everything else stays local. */
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
