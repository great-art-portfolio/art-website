import type { AppEnv } from "./env";
import { CONFIRM_TTL_MS, issueLinkToken, verifyLinkToken } from "./collectors";

/** Dev-only email list, so dev doesn't touch the real list in Resend. With
 * COLLECTORS_MOCK=true, the collectors endpoint stores pending and
 * confirmed addresses in the local D1 email_collectors table and returns a
 * confirm link instead of sending email. The mock only activates on
 * localhost, so a leaked flag has no effect elsewhere. Mock links use
 * localhost URLs and a dev-only HMAC key. */

const MOCK_KEY = "dev-collectors-mock";

export function mockList(env: AppEnv, request: Request): boolean {
  if (env.COLLECTORS_MOCK !== "true") return false;
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

function mockEnv(env: AppEnv): AppEnv {
  return { ...env, RESEND_API_KEY: MOCK_KEY };
}

interface MockRow {
  token: string;
  confirmed_at: string | null;
}

export async function mockSubscribe(
  env: AppEnv,
  email: string,
): Promise<{ already: boolean; token: string } | null> {
  const row = await env.DB.prepare(
    "SELECT token, confirmed_at FROM email_collectors WHERE email = ?",
  )
    .bind(email)
    .first<MockRow>();
  if (row !== null && row.confirmed_at !== null && row.confirmed_at !== "") {
    return { already: true, token: "" };
  }
  const token = await issueLinkToken(mockEnv(env), email, "confirm");
  if (token === null) return null;
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO email_collectors (email, token, confirmed_at, token_created_at, created_at) VALUES (?, ?, NULL, ?, ?) ON CONFLICT (email) DO UPDATE SET token = excluded.token, token_created_at = excluded.token_created_at",
  )
    .bind(email, token, now, now)
    .run();
  return { already: false, token };
}

export async function mockConfirm(
  env: AppEnv,
  email: string,
  token: string,
): Promise<boolean> {
  const ok = await verifyLinkToken(
    mockEnv(env),
    email,
    token,
    "confirm",
    CONFIRM_TTL_MS,
  );
  if (ok === null) return false;
  await env.DB.prepare(
    "UPDATE email_collectors SET confirmed_at = ? WHERE email = ?",
  )
    .bind(new Date().toISOString(), email)
    .run();
  return true;
}

export async function mockUnsubscribe(
  env: AppEnv,
  email: string,
): Promise<void> {
  await env.DB.prepare("DELETE FROM email_collectors WHERE email = ?")
    .bind(email)
    .run();
}

export async function mockCount(env: AppEnv): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM email_collectors WHERE confirmed_at IS NOT NULL AND confirmed_at != ''",
  )
    .bind()
    .first<{ total: number }>();
  return row?.total ?? 0;
}
