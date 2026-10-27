import type { AppEnv } from "./env";
import { logEvent } from "./log";

/** Cloudflare Access sign-in for the admin API. Access guards /admin* with
 * an email code, and its CF_Authorization cookie is scoped to the whole
 * host, so the studio's fetches to /api/* carry it. /api/* itself isn't
 * behind Access (buyers post inquiries there), so the token is checked
 * here: an RS256 JWT signed by the team's keys, for this app's audience,
 * not expired. Spec:
 * https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/ */

interface Jwk extends JsonWebKey {
  kid?: string;
}

const CERTS_TTL_MS = 60 * 60 * 1000;
let certsCache: { url: string; at: number; keys: Jwk[] } | null = null;

/** Clears the signing key cache (tests). */
export function resetAccessCache(): void {
  certsCache = null;
}

async function signingKeys(team: string, now: number): Promise<Jwk[]> {
  const url = `https://${team}/cdn-cgi/access/certs`;
  if (
    certsCache !== null &&
    certsCache.url === url &&
    now - certsCache.at < CERTS_TTL_MS
  )
    return certsCache.keys;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Access certs answered ${res.status}`);
  const data = (await res.json()) as { keys?: Jwk[] };
  const keys = Array.isArray(data.keys) ? data.keys : [];
  certsCache = { url, at: now, keys };
  return keys;
}

function base64UrlBytes(part: string): Uint8Array<ArrayBuffer> {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function base64UrlJson(part: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(
      new TextDecoder().decode(base64UrlBytes(part)),
    ) as unknown;
    return typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** The Access token on a request: the header Access adds on protected
 * paths, else the browser's sign-in cookie. */
export function accessToken(request: Request): string | null {
  const header = request.headers.get("cf-access-jwt-assertion");
  if (header !== null && header !== "") return header;
  const cookies = request.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === "CF_Authorization" && rest.length > 0) return rest.join("=");
  }
  return null;
}

/** The signed-in email when the request carries a valid Access token for
 * this app, else null. Never throws: a missing config, a bad token, or an
 * unreachable key endpoint all mean "not signed in". */
export async function accessEmail(
  request: Request,
  env: AppEnv,
  now = Date.now(),
): Promise<string | null> {
  const team = env.ACCESS_TEAM_DOMAIN ?? "";
  const aud = env.ACCESS_AUD ?? "";
  const token = accessToken(request);
  if (team === "" || aud === "" || token === null) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [rawHeader = "", rawPayload = "", rawSig = ""] = parts;
  const header = base64UrlJson(rawHeader);
  const payload = base64UrlJson(rawPayload);
  if (header === null || payload === null || header["alg"] !== "RS256")
    return null;
  const audiences = Array.isArray(payload["aud"])
    ? payload["aud"]
    : [payload["aud"]];
  if (!audiences.includes(aud)) return null;
  if (payload["iss"] !== `https://${team}`) return null;
  const exp = payload["exp"];
  if (typeof exp !== "number" || exp * 1000 <= now) return null;
  try {
    const jwk = (await signingKeys(team, now)).find(
      (k) => k.kid === header["kid"],
    );
    if (jwk === undefined) return null;
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64UrlBytes(rawSig),
      new TextEncoder().encode(`${rawHeader}.${rawPayload}`),
    );
    if (!ok) return null;
  } catch (err) {
    await logEvent(env, {
      level: "warn",
      event: "access.verify_threw",
      message: "Checking a studio sign-in threw",
      err,
    });
    return null;
  }
  const email = payload["email"];
  return typeof email === "string" ? email : "";
}
