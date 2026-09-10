import type { AppEnv } from "./env";

/** Email list with no storage: confirmed addresses live in Resend, and the
 * pending proof travels inside the emailed links as HMAC tokens. */

const MAX_EMAIL_LENGTH = 254;

/** Normalize a submitted address, or null. The tap proves it later. */
export function parseCollectorEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  if (email === "" || email.length > MAX_EMAIL_LENGTH) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

/** Confirm links live a week; goodbye links never expire. */
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

/** Mint a purpose-bound token. Keyed by the Resend secret, so rotating it
 * invalidates outstanding links. */
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

/** Verify a token. Null maxAgeMs = never expires. Null = dead link. */
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
