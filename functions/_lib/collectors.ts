import type { AppEnv } from "./env";

/** Email list with no local storage. Confirmed addresses live in Resend,
 * and pending confirmations are HMAC tokens inside the emailed links. */

const MAX_EMAIL_LENGTH = 254;

/** Normalizes a submitted address, or returns null. Ownership is proven
 * later by the confirm link. */
export function parseCollectorEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  if (email === "" || email.length > MAX_EMAIL_LENGTH) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

/** Confirm links expire after a week. Goodbye links don't expire. */
export const CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type LinkKind = "confirm" | "goodbye";

/** UTF-8 base64url, so an address with letters like ł or ü (valid, and
 * past the form's check) gets a link instead of a crash. ASCII addresses
 * encode exactly as before, so links already sent keep working. */
function b64urlEncode(text: string): string {
  let binary = "";
  for (const b of new TextEncoder().encode(text))
    binary += String.fromCharCode(b);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function b64urlDecode(text: string): string | null {
  try {
    const padded = text.replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      // A link from before UTF-8 links, for an é-style address.
      return binary;
    }
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

/** Issues a token bound to one purpose. It's keyed by the Resend secret, so
 * rotating the secret invalidates outstanding links. */
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

/** Verifies a token. A null maxAgeMs means no expiry. Returns null for an
 * invalid or expired link. */
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
