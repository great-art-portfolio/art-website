import { accessEmail } from "./access";
import { GitHubKeyError, KEY_REFUSED } from "./github";
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

/** True when a request came from this site's own pages. Browsers send
 * Sec-Fetch-Site (and Origin) on every request a page starts, so another
 * site's page can't pass. A request with neither header isn't from a web
 * page at all (the nightly job, curl), and its credentials are deliberate. */
export function fromOwnSite(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null) return site === "same-origin" || site === "none";
  const origin = request.headers.get("origin");
  if (origin !== null) return origin === new URL(request.url).origin;
  return true;
}

/** Same-length strings compared without an early exit, so response time
 * doesn't leak how much of a secret matched. */
export function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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
  const header = request.headers.get("authorization") ?? "";
  if (expected !== "" && sameSecret(header, `Bearer ${expected}`)) return null;
  if ((await accessEmail(request, env)) !== null) {
    // Her sign-in cookie rides along on requests any other site's page
    // starts too, so a change has to come from the studio's own pages.
    // Reads are left alone: another site can't see the answer.
    const reading = request.method === "GET" || request.method === "HEAD";
    if (reading || fromOwnSite(request)) return null;
    return json(
      { error: "That request didn't come from the studio." },
      {
        status: 403,
      },
    );
  }
  if (expected === "" && isLocalRequest(request)) return null;
  return json({ error: "Unauthorized" }, { status: 401 });
}

/** A failed GitHub call, in her words: a refused key says so (503, so the
 * studio shows it instead of blaming her connection), anything else is
 * the fallback 500. */
export function githubFailure(err: unknown, fallback?: string): Response {
  console.error(err);
  if (err instanceof GitHubKeyError)
    return json({ error: KEY_REFUSED, code: "github-key" }, { status: 503 });
  return serverError(fallback);
}
