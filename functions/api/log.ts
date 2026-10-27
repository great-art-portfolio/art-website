import type { AppEnv } from "../_lib/env";
import { badRequest, fromOwnSite, json } from "../_lib/http";
import { logEvent } from "../_lib/log";

/** Most browser reports kept in any ten minutes, so a broken page seen by
 * many visitors (or someone posting junk) can't fill the table. */
export const CLIENT_LOG_LIMIT = 100;
const MAX_BODY = 6000;

const text = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";

/**
 * Public: a page reports an error (src/lib/report.ts). Only this site's
 * own pages may post, bodies are small, and the event is always
 * namespaced "client." so a report can't pass for a server event.
 * Answers 204 whether it kept the report or not.
 */
export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const { request, env } = context;
  if (!fromOwnSite(request))
    return json({ error: "Not allowed" }, { status: 403 });
  const raw = await request.text().catch(() => "");
  if (raw.length > MAX_BODY) return badRequest("Too large");
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null)
      return badRequest("Invalid JSON");
    body = parsed as Record<string, unknown>;
  } catch {
    return badRequest("Invalid JSON");
  }
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM logs WHERE source = 'client' AND at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes')",
  )
    .first<{ n: number }>()
    .catch(() => null);
  if ((recent?.n ?? 0) >= CLIENT_LOG_LIMIT)
    return new Response(null, { status: 204 });
  const event = text(body["event"], 60).replace(/[^a-z0-9_.]/gi, "") || "error";
  const detail =
    typeof body["detail"] === "object" && body["detail"] !== null
      ? (body["detail"] as Record<string, unknown>)
      : {};
  await logEvent(env, {
    level: body["level"] === "warn" ? "warn" : "error",
    source: "client",
    event: `client.${event}`,
    message: text(body["message"], 500) || "(no message)",
    detail: {
      ...detail,
      stack: text(body["stack"], 2000),
      agent: (request.headers.get("user-agent") ?? "").slice(0, 160),
    },
    request,
    route: `page ${text(body["page"], 200)}`,
  });
  return new Response(null, { status: 204 });
};
