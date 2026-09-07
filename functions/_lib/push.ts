import type { AppEnv } from "./env";
import { parseJwk } from "./validation";

/**
 * Web Push, payload-free ("tickle") style. The server only pings the
 * browser; the service worker then fetches the latest painting and shows
 * the notification itself. This skips payload encryption (the fiddly
 * aes128gcm part) with no downside here — the message is always
 * "there's a new painting, come look".
 */

export interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of u8) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function configured(env: AppEnv): boolean {
  return (
    (env.VAPID_PUBLIC_KEY ?? "") !== "" && (env.VAPID_PRIVATE_JWK ?? "") !== ""
  );
}

function envJwk(raw: string | undefined): JsonWebKey | null {
  try {
    return parseJwk(JSON.parse(raw ?? "") as unknown);
  } catch {
    return null;
  }
}

async function vapidHeader(env: AppEnv, endpoint: string): Promise<string> {
  const jwk = envJwk(env.VAPID_PRIVATE_JWK);
  if (jwk === null) throw new Error("Bad VAPID key");
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const aud = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
  const contact = (env.VAPID_CONTACT ?? "").trim();
  const sub = contact === "" ? "mailto:localhost" : contact;
  const head = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64url(enc.encode(JSON.stringify({ aud, exp, sub })));
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    enc.encode(`${head}.${body}`),
  );
  return `vapid t=${head}.${body}.${b64url(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}

export type Tickle = "sent" | "gone" | "retry" | "unconfigured";

export async function sendTickle(
  env: AppEnv,
  sub: StoredSubscription,
): Promise<Tickle> {
  if (!configured(env)) return "unconfigured";
  let auth: string;
  try {
    auth = await vapidHeader(env, sub.endpoint);
  } catch (err) {
    console.error("vapid sign failed", err);
    return "retry";
  }
  let res: Response;
  try {
    res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: auth,
        TTL: "86400",
        Urgency: "normal",
        "Content-Length": "0",
      },
    });
  } catch (err) {
    console.error("push fetch failed", err);
    return "retry";
  }
  if (res.status === 404 || res.status === 410) return "gone"; // Expired — delete it.
  if (!res.ok)
    console.error("push service error", res.status, await res.text());
  return res.ok ? "sent" : "retry";
}

export async function listSubscriptions(
  env: AppEnv,
): Promise<StoredSubscription[]> {
  const res = await env.DB.prepare(
    "SELECT endpoint, p256dh, auth FROM push_subscriptions",
  ).all<StoredSubscription>();
  return res.results ?? [];
}

export async function removeSubscription(
  env: AppEnv,
  endpoint: string,
): Promise<void> {
  await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
    .bind(endpoint)
    .run();
}
