import type { AppEnv } from "./env";

/**
 * Cloudflare Turnstile check, shared by every public write (inquiries,
 * collector signup). Keys arrive with the dashboard setup; until then the
 * honeypot covers us, so an empty secret means "pass".
 *
 * Re-evaluate against:
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
export async function turnstileOk(
  env: AppEnv,
  token: unknown,
  ip: string | null,
): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET_KEY ?? "";
  if (secret === "") return true;
  if (typeof token !== "string" || token === "") return false;
  try {
    const form = new FormData();
    form.set("secret", secret);
    form.set("response", token);
    if (ip !== null) form.set("remoteip", ip);
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: form,
      },
    );
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    console.error("turnstile verify failed", err);
    return false;
  }
}
