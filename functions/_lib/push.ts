import type { AppEnv } from "./env";
import { parseJwk } from "./validation";

/** Payload-free Web Push ("tickle"): the server pings, the service worker
 * fetches the latest painting and shows it. No payload encryption needed. */

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
  limit?: number,
  offset?: number,
): Promise<StoredSubscription[]> {
  if (limit === undefined) {
    const res = await env.DB.prepare(
      "SELECT endpoint, p256dh, auth FROM push_subscriptions",
    ).all<StoredSubscription>();
    return res.results ?? [];
  }
  const res = await env.DB.prepare(
    "SELECT endpoint, p256dh, auth FROM push_subscriptions LIMIT ? OFFSET ?",
  )
    .bind(limit, offset ?? 0)
    .all<StoredSubscription>();
  return res.results ?? [];
}

/** How many browsers a ping reaches. The count rides along so the Ping
 * button can ask first — and the fan-out below goes out in batches. */
export async function countSubscriptions(env: AppEnv): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM push_subscriptions",
  )
    .bind()
    .first<{ total: number }>();
  return row?.total ?? 0;
}

/** Browsers pinged per Worker call. One call only carries about 50
 * subrequests on the free allowance, and each ping is one — 40 leaves
 * room to spare. Big lists walk cursor by cursor. */
export const TICKLE_BATCH = 40;

export async function removeSubscription(
  env: AppEnv,
  endpoint: string,
): Promise<void> {
  await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
    .bind(endpoint)
    .run();
}

/** Custom ping line the next tickle shows. Tickles carry no payload (no
 * encryption), so the service worker fetches this when one arrives;
 * empty means the standard note. One row, ever. */
export async function savePushMessage(
  env: AppEnv,
  body: string,
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO push_message (id, body) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET body = excluded.body",
  )
    .bind(body)
    .run();
}

export async function readPushMessage(env: AppEnv): Promise<string> {
  const row = await env.DB.prepare("SELECT body FROM push_message WHERE id = 1")
    .bind()
    .first<{ body: string }>();
  return row?.body ?? "";
}

/** Default gap between browser ping fan-outs, so a repeated tap can't
 * spam subscribers. Overridable per environment via PUSH_COOLDOWN_S
 * (seconds); empty pings (nobody subscribed) never count. */
export const DEFAULT_PUSH_COOLDOWN_MS = 5 * 60 * 1000;

export function pushCooldownMs(env: AppEnv): number {
  const raw = Number(env.PUSH_COOLDOWN_S ?? "");
  return Number.isFinite(raw) && raw > 0
    ? Math.floor(raw) * 1000
    : DEFAULT_PUSH_COOLDOWN_MS;
}

export async function readLastPushAt(env: AppEnv): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT pushed_at FROM push_message WHERE id = 1",
  )
    .bind()
    .first<{ pushed_at: string }>();
  const at = Date.parse(row?.pushed_at ?? "");
  return Number.isNaN(at) ? 0 : at;
}

export async function stampPushAt(env: AppEnv): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO push_message (id, pushed_at) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET pushed_at = excluded.pushed_at",
  )
    .bind(new Date().toISOString())
    .run();
}
