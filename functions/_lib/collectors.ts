import type { AppEnv } from "./env";

/**
 * Collector email list. Storage for the "tell me about new paintings"
 * addresses — the channel for every browser that can't do Web Push.
 */

const MAX_EMAIL_LENGTH = 254;

/**
 * Normalize a submitted address, or null when it isn't one. Strict but
 * simple on purpose: subscribing only writes a row (unlike inquiries it
 * sends nothing immediately), and the address proves itself when the
 * first broadcast lands. Shared by the endpoint and the unit tests.
 */
export function parseCollectorEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  if (email === "" || email.length > MAX_EMAIL_LENGTH) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export async function addCollectorEmail(
  env: AppEnv,
  email: string,
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO email_collectors (email) VALUES (?) ON CONFLICT(email) DO NOTHING",
  )
    .bind(email)
    .run();
}

export async function listCollectorEmails(env: AppEnv): Promise<string[]> {
  const res = await env.DB.prepare(
    "SELECT email FROM email_collectors ORDER BY created_at ASC",
  ).all<{ email: string }>();
  return (res.results ?? []).map((r) => r.email);
}
