import type { AppEnv } from "./env";

/**
 * Collector email list ("tell me about new paintings" addresses).
 *
 * Stateless by design: nothing about the list lives here. Confirmed
 * addresses live in Resend as segment contacts; the pending "did they
 * tap?" proof travels inside the link itself as an HMAC token, so there
 * is no pending table to tend, expire, or leak. D1 keeps nothing.
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
 * inbox, short enough a leaked link dies on its own. Goodbye links
 * never expire: the exit must work from decade-old emails.
 */
export const CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type LinkKind = "confirm" | "goodbye";

function b64urlEncode(text: string): string {
  return btoa(text)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function b64urlDecode(text: string): string | null {
  try {
    const padded = text.replaceAll("-", "+").replaceAll("_", "/");
    return atob(padded);
  } catch {
    return null;
  }
}

async function hmacHex(key: string, data: string): Promise<string> {
  const bytes = new TextEncoder().encode(data);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, bytes);
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function slowEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function linkKey(env: AppEnv): string {
  return env.RESEND_API_KEY ?? "";
}

/**
 * Mint a link token binding an address to a purpose. The key is the
 * Resend secret every list flow needs anyway — rotating it invalidates
 * outstanding links (rejoining mints a fresh one).
 */
export async function issueLinkToken(
  env: AppEnv,
  email: string,
  kind: LinkKind,
  issuedAtMs: number = Date.now(),
): Promise<string | null> {
  const key = linkKey(env);
  if (key === "" || email === "") return null;
  const issued = issuedAtMs.toString(36);
  const sig = await hmacHex(key, `${kind}.${email}.${issued}`);
  return `${b64urlEncode(email)}.${issued}.${sig}`;
}

/**
 * Check a link token: right address, right purpose, intact signature,
 * and (for confirmations) fresh. Returns the address, or null when the
 * link is dead. Pass null maxAgeMs for links that never expire.
 */
export async function verifyLinkToken(
  env: AppEnv,
  email: string,
  token: string,
  kind: LinkKind,
  maxAgeMs: number | null,
): Promise<string | null> {
  const key = linkKey(env);
  if (key === "" || email === "" || token === "") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [coded, issuedRaw, sig] = parts;
  if (coded === undefined || issuedRaw === undefined || sig === undefined) {
    return null;
  }
  const embedded = b64urlDecode(coded);
  if (embedded === null || embedded !== email) return null;
  const issued = Number.parseInt(issuedRaw, 36);
  if (!Number.isFinite(issued)) return null;
  if (maxAgeMs !== null) {
    if (issued > Date.now() + 5 * 60 * 1000) return null;
    if (Date.now() - issued > maxAgeMs) return null;
  }
  const expected = await hmacHex(key, `${kind}.${email}.${issuedRaw}`);
  return slowEqual(expected, sig) ? email : null;
}
