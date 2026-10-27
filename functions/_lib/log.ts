/** Logs for agents. Every error worth knowing about goes to the D1 `logs`
 * table (read with `pnpm logs`) and to the console as one JSON line (seen
 * by `wrangler pages deployment tail`). Logging never throws: a failed
 * write only reaches the console. What a visitor or the artist sees is
 * written separately, in plain words, by the caller. */
import type { AppEnv } from "./env";

export type LogLevel = "error" | "warn" | "info";
export type LogSource = "server" | "client" | "job";

export interface LogEntry {
  level?: LogLevel;
  source?: LogSource;
  /** Stable dotted key to filter on, e.g. "inquiry.email_failed". */
  event: string;
  message: string;
  /** The thrown value, if any: its message and stack go in detail. */
  err?: unknown;
  /** Small JSON context: status codes, provider answers, slugs. Never
   * secrets or tokens. */
  detail?: Record<string, unknown>;
  /** The request it happened in, for the route and Cloudflare's ray id. */
  request?: Request;
  /** Overrides the route, e.g. the page a browser report came from. */
  route?: string;
}

const MAX_MESSAGE = 500;
const MAX_DETAIL = 4000;
/** Rows older than this are dropped, now and then, as new ones arrive. */
const KEEP_DAYS = 90;

/** The thrown value as plain JSON: message, name, and a trimmed stack. */
export function errorDetail(err: unknown): Record<string, unknown> {
  if (err instanceof Error)
    return {
      error: err.message,
      name: err.name,
      stack: (err.stack ?? "").split("\n").slice(0, 8).join("\n"),
    };
  return err === undefined ? {} : { error: String(err) };
}

/** The row a log entry becomes, kept pure for tests. */
export function logRow(entry: LogEntry): {
  level: LogLevel;
  source: LogSource;
  event: string;
  message: string;
  route: string;
  ray: string;
  detail: string;
} {
  const req = entry.request;
  const route =
    entry.route ??
    (req === undefined ? "" : `${req.method} ${new URL(req.url).pathname}`);
  let detail = JSON.stringify({ ...errorDetail(entry.err), ...entry.detail });
  if (detail.length > MAX_DETAIL)
    detail = JSON.stringify({ truncated: detail.slice(0, MAX_DETAIL) });
  return {
    level: entry.level ?? "error",
    source: entry.source ?? "server",
    event: entry.event.slice(0, 80),
    message: entry.message.slice(0, MAX_MESSAGE),
    route,
    ray: req?.headers.get("cf-ray") ?? "",
    detail,
  };
}

/** Writes one entry. Await it, or hand it to `context.waitUntil`. */
export async function logEvent(env: AppEnv, entry: LogEntry): Promise<void> {
  const row = logRow(entry);
  const line = JSON.stringify({ log: true, ...row });
  if (row.level === "error") console.error(line);
  else if (row.level === "warn") console.warn(line);
  else console.log(line);
  try {
    if (env.DB === undefined) return;
    await env.DB.prepare(
      "INSERT INTO logs (level, source, event, message, route, ray, detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        row.level,
        row.source,
        row.event,
        row.message,
        row.route,
        row.ray,
        row.detail,
      )
      .run();
    // About one write in fifty also trims old rows.
    if (Math.random() < 0.02)
      await env.DB.prepare(
        `DELETE FROM logs WHERE at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${KEEP_DAYS} days')`,
      ).run();
  } catch (err) {
    console.error(
      JSON.stringify({
        log: true,
        event: "log.write_failed",
        ...errorDetail(err),
      }),
    );
  }
}
