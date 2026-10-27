/**
 * Reads the site's logs and inquiries from D1, newest first, for agents.
 *
 *   pnpm logs                         errors and warnings, last 7 days
 *   pnpm logs --since 2h              any window: 30m, 2h, 7d
 *   pnpm logs --event broadcast       events starting with "broadcast"
 *   pnpm logs --level error           only errors (or warn, info)
 *   pnpm logs --source client         server | client | job
 *   pnpm logs --limit 100             default 50
 *   pnpm logs --inquiries             buyer inquiries; --failed for unsent
 *   pnpm logs --local                 the local D1 (dev and e2e) instead
 *
 * Event keys: http.5xx / http.uncaught (any endpoint), inquiry.*, sale.*,
 * checkout.*, broadcast.*, list.*, collectors.*, email.*, spamcheck.*,
 * translate.*, suggest.*, access.*, client.* (browser; client.studio.shown
 * is every error message the studio showed her).
 */
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};

/** "30m", "2h", "7d" → an SQLite datetime modifier. */
export function sinceModifier(raw) {
  const m = /^(\d+)([mhd])$/.exec(raw);
  if (m === null) throw new Error(`--since wants 30m, 2h or 7d, not ${raw}`);
  const unit = { m: "minutes", h: "hours", d: "days" }[m[2]];
  return `-${m[1]} ${unit}`;
}

/** The SELECT for the given options, with every value checked first so
 * nothing typed reaches the SQL unescaped. */
export function buildQuery(opts) {
  const since = sinceModifier(opts.since);
  const limit = Math.max(1, Math.min(1000, Number(opts.limit) || 50));
  const at = `at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '${since}')`;
  if (opts.inquiries) {
    const failed = opts.failed ? " AND status != 'sent'" : "";
    return `SELECT id, at, status, error, slug, buyer_name, buyer_email, locale, message FROM inquiries WHERE ${at}${failed} ORDER BY id DESC LIMIT ${limit}`;
  }
  const where = [at];
  if (opts.level !== "") {
    if (!["error", "warn", "info"].includes(opts.level))
      throw new Error("--level is error, warn or info");
    where.push(`level = '${opts.level}'`);
  } else {
    where.push("level IN ('error', 'warn')");
  }
  if (opts.source !== "") {
    if (!["server", "client", "job"].includes(opts.source))
      throw new Error("--source is server, client or job");
    where.push(`source = '${opts.source}'`);
  }
  if (opts.event !== "") {
    if (!/^[a-z0-9_.]+$/i.test(opts.event))
      throw new Error("--event takes letters, digits, dots and underscores");
    where.push(`event LIKE '${opts.event}%'`);
  }
  return `SELECT id, at, level, source, event, message, route, ray, detail FROM logs WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ${limit}`;
}

function format(row, inquiries) {
  if (inquiries)
    return `#${row.id} ${row.at} [${row.status}] ${row.slug} from ${row.buyer_name} <${row.buyer_email}> (${row.locale})${row.error ? ` error: ${row.error}` : ""}\n    ${String(row.message).replace(/\n/g, "\n    ")}`;
  let detail = "";
  try {
    const d = JSON.parse(row.detail);
    if (Object.keys(d).length > 0) detail = `\n    ${JSON.stringify(d)}`;
  } catch {
    detail = `\n    ${row.detail}`;
  }
  const where = [row.route, row.ray && `ray ${row.ray}`]
    .filter(Boolean)
    .join(" ");
  return `#${row.id} ${row.at} ${row.level.toUpperCase()} ${row.source} ${row.event}${where ? ` (${where})` : ""}: ${row.message}${detail}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const opts = {
    since: value("since", "7d"),
    limit: value("limit", "50"),
    level: value("level", ""),
    source: value("source", ""),
    event: value("event", ""),
    inquiries: flag("inquiries"),
    failed: flag("failed"),
  };
  const sql = buildQuery(opts);
  const out = execFileSync(
    "pnpm",
    [
      "wrangler",
      "d1",
      "execute",
      "art-gallery-db",
      flag("local") ? "--local" : "--remote",
      "--json",
      "--command",
      sql,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  const rows = JSON.parse(out.slice(out.indexOf("[")))[0]?.results ?? [];
  if (rows.length === 0) console.log("Nothing in that window.");
  for (const row of rows) console.log(format(row, opts.inquiries));
}
