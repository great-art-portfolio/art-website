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

/** Admin check. Cloudflare Access protects production, and the token is
 * a second layer and the local dev gate. If no token is configured, the
 * request is allowed. */
export function requireAdmin(request: Request, env: AppEnv): Response | null {
  const expected = env.ADMIN_API_TOKEN;
  if (expected === undefined || expected === "") return null;
  const header = request.headers.get("authorization");
  if (header === `Bearer ${expected}`) return null;
  return json({ error: "Unauthorized" }, { status: 401 });
}
