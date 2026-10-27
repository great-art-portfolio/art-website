import type { AppEnv } from "./env";
import { logEvent } from "./log";

/** Turnstile check for public writes. With no secret configured it passes
 * only on this machine (dev and tests); a deployed site without the secret
 * refuses, rather than quietly letting scripts send email through it. Per the server-side validation spec, this
 * POSTs form-encoded secret, response, and optional remoteip to
 * https://challenges.cloudflare.com/turnstile/v0/siteverify. Tokens are
 * single-use, up to 2048 chars, and valid for 5 minutes. The response is
 * JSON { success, hostname, action, error-codes }.
 * Spec: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/ */
const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TOKEN_LENGTH = 2048;
const VERIFY_TIMEOUT_MS = 10_000;

export async function turnstileOk(
  env: AppEnv,
  token: unknown,
  ip: string | null,
  request?: Request,
): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET_KEY ?? "";
  if (secret === "") {
    if (request === undefined) return true;
    const host = new URL(request.url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  }
  if (typeof token !== "string" || token === "") return false;
  if (token.length > MAX_TOKEN_LENGTH) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const form = new URLSearchParams();
    form.set("secret", secret);
    form.set("response", token);
    if (ip !== null && ip !== "") form.set("remoteip", ip);
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: controller.signal,
    });
    const data = (await res.json()) as {
      success?: boolean;
      hostname?: unknown;
      action?: unknown;
      ["error-codes"]?: unknown;
    };
    if (data.success === true) return true;
    // Log the reason server-side only. Buyers don't see error codes.
    await logEvent(env, {
      level: "warn",
      event: "spamcheck.rejected",
      message: "Turnstile rejected a token",
      detail: { codes: data["error-codes"] ?? "unknown" },
    });
    return false;
  } catch (err) {
    await logEvent(env, {
      event: "spamcheck.threw",
      message: "Verifying a Turnstile token threw",
      err,
    });
    return false;
  } finally {
    clearTimeout(timer);
  }
}
