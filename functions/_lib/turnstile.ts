import type { AppEnv } from "./env";

/** Turnstile check for public writes. With no secret configured, it passes
 * and only the honeypot applies. Per the server-side validation spec, this
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
): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET_KEY ?? "";
  if (secret === "") return true;
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
    console.error("turnstile rejected", data["error-codes"] ?? "unknown");
    return false;
  } catch (err) {
    console.error("turnstile verify failed", err);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
