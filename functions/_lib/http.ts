import { accessEmail } from "./access";
import type { AppEnv } from "./env";

export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

export function badRequest(message: string): Response {
  return json({ error: message }, { status: 400 });
}

/** A failed or missing Turnstile check. 403, not 400, so clients can ask
 * the visitor to finish the check, and the offline outbox keeps the note
 * for a resend with a fresh token instead of dropping it as bad input. */
export function spamCheckFailed(): Response {
  return json(
    { error: "Spam check failed — please try again." },
    { status: 403 },
  );
}

export function serverError(message = "Something went wrong"): Response {
  return json({ error: message }, { status: 500 });
}

export function notEnabled(feature: string, hint: string): Response {
  return json(
    { error: `${feature} is disabled`, howToEnable: hint },
    { status: 501 },
  );
}

/** True for requests to this machine (dev servers and tests). */
export function isLocalRequest(request: Request): boolean {
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

/** Admin check. Cloudflare Access signs her in on /admin with an email
 * code, and a valid Access sign-in lets the studio's API calls through
 * (lib/access), so she never handles a token. The token is the backup and
 * the local dev gate. With no token configured and no Access sign-in only
 * localhost is let in, so a missing secret never opens the live API. */
export async function requireAdmin(
  request: Request,
  env: AppEnv,
): Promise<Response | null> {
  const expected = env.ADMIN_API_TOKEN ?? "";
  const header = request.headers.get("authorization");
  if (expected !== "" && header === `Bearer ${expected}`) return null;
  if ((await accessEmail(request, env)) !== null) return null;
  if (expected === "" && isLocalRequest(request)) return null;
  return json({ error: "Unauthorized" }, { status: 401 });
}
