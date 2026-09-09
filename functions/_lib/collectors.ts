import type { AppEnv } from "./env";

/**
 * Collector email list. Storage for the "tell me about new paintings"
 * addresses — the channel for every browser that can't do Web Push.
 */

const MAX_EMAIL_LENGTH = 254;

/**
 * Normalize a submitted address, or null when it isn't one. Strict but
 * simple on purpose; the address then proves itself by tapping the
 * confirmation email. Shared by the endpoint and the unit tests.
 */
export function parseCollectorEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  if (email === "" || email.length > MAX_EMAIL_LENGTH) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

/**
 * Confirm links stay valid this long — enough to check tomorrow's
 * inbox, short enough a leaked link dies on its own.
 */
export const CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function newCollectorToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

interface CollectorRow {
  token: string | null;
  confirmed_at: string | null;
  token_created_at: string | null;
}

async function collectorRow(
  env: AppEnv,
  email: string,
): Promise<CollectorRow | null> {
  return env.DB.prepare(
    "SELECT token, confirmed_at, token_created_at FROM email_collectors WHERE email = ?",
  )
    .bind(email)
    .first<CollectorRow>();
}

/**
 * Join (or rejoin): unconfirmed addresses get a fresh token and must
 * tap the confirmation email; already-confirmed ones stay as they are.
 */
export async function signupCollectorEmail(
  env: AppEnv,
  email: string,
): Promise<{ token: string; already: boolean }> {
  const now = new Date().toISOString();
  const existing = await collectorRow(env, email);
  if (existing !== null && existing.confirmed_at !== null) {
    let token = existing.token;
    if (token === null) {
      token = newCollectorToken();
      await env.DB.prepare(
        "UPDATE email_collectors SET token = ?, token_created_at = ? WHERE email = ?",
      )
        .bind(token, now, email)
        .run();
    }
    return { token, already: true };
  }
  const token = newCollectorToken();
  await env.DB.prepare(
    "INSERT INTO email_collectors (email, token, confirmed_at, token_created_at) VALUES (?, ?, NULL, ?) ON CONFLICT(email) DO UPDATE SET token = excluded.token, token_created_at = excluded.token_created_at",
  )
    .bind(email, token, now)
    .run();
  return { token, already: false };
}

/**
 * Tap the confirmation link: unexpired and unconfirmed becomes
 * confirmed. Returns the address, or null when the link is dead — the
 * caller needs the address to mirror the join into Resend.
 */
export async function confirmCollectorEmail(
  env: AppEnv,
  token: string,
): Promise<string | null> {
  if (token === "") return null;
  const row = await env.DB.prepare(
    "SELECT email, token_created_at, confirmed_at FROM email_collectors WHERE token = ?",
  )
    .bind(token)
    .first<{
      email: string;
      token_created_at: string | null;
      confirmed_at: string | null;
    }>();
  if (row === null) return null;
  if (row.confirmed_at !== null) return row.email;
  const created = Date.parse(row.token_created_at ?? "");
  if (Number.isNaN(created) || Date.now() - created > CONFIRM_TTL_MS)
    return null;
  await env.DB.prepare(
    "UPDATE email_collectors SET confirmed_at = ? WHERE token = ?",
  )
    .bind(new Date().toISOString(), token)
    .run();
  return row.email;
}

/** Leave by token (one-click link): returns the removed address, if any. */
export async function removeCollectorByToken(
  env: AppEnv,
  token: string,
): Promise<string | null> {
  if (token === "") return null;
  const row = await env.DB.prepare(
    "SELECT email FROM email_collectors WHERE token = ?",
  )
    .bind(token)
    .first<{ email: string }>();
  if (row === null) return null;
  await env.DB.prepare("DELETE FROM email_collectors WHERE token = ?")
    .bind(token)
    .run();
  return row.email;
}

/** Leave by address (the modal button): quiet when absent. */
export async function removeCollectorEmail(
  env: AppEnv,
  email: string,
): Promise<void> {
  await env.DB.prepare("DELETE FROM email_collectors WHERE email = ?")
    .bind(email)
    .run();
}

/** Broadcasts only ever reach confirmed addresses. */
export async function listConfirmedCollectorEmails(
  env: AppEnv,
): Promise<Array<{ email: string; token: string }>> {
  const res = await env.DB.prepare(
    "SELECT email, token FROM email_collectors WHERE confirmed_at IS NOT NULL ORDER BY created_at ASC",
  ).all<{ email: string; token: string | null }>();
  return (res.results ?? [])
    .filter((r) => r.token !== null)
    .map((r) => ({ email: r.email, token: r.token as string }));
}
