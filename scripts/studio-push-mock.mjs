/** Dev-only Web Push loop for `pnpm dev:studio`.
 *
 * The studio sidecar has no D1 and no VAPID secrets, so subscribe + ping
 * would 404 there — yet that is exactly where the flow needs clicking
 * through. This module stands in: it mints its own VAPID keypair (cached
 * under node_modules/.cache so browser subscriptions survive sidecar
 * restarts), keeps subscriptions and the custom ping line in memory, and
 * answers the same /api/push, /api/push-message, and /api/notify shapes
 * the Pages Functions serve. Tickles go out over the real push service,
 * so a dev subscription pings a real browser.
 *
 * Deliberately NOT prod behavior: no cooldown (the user is the only
 * tapper here), no email side (emailed is always false), subscriptions
 * vanish if the cache is cleared. Nothing here runs outside localhost.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const CACHE_FILE = "studio-push.json";
const VAPID_CONTACT = "mailto:localhost";

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
}

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

async function loadKeypair(cacheDir) {
  try {
    const raw = JSON.parse(await readFile(join(cacheDir, CACHE_FILE), "utf8"));
    if (typeof raw?.privateJwk === "object" && raw?.publicKey !== "") {
      return raw;
    }
  } catch {
    // First run (or a cleared cache) — mint below.
  }
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const pair = {
    privateJwk: await crypto.subtle.exportKey("jwk", privateKey),
    // Raw uncompressed point (0x04 || x || y), the VAPID public format.
    publicKey: b64url(await crypto.subtle.exportKey("raw", publicKey)),
  };
  try {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(join(cacheDir, CACHE_FILE), JSON.stringify(pair));
  } catch {
    // Cache is convenience only — an uncached pair still works until
    // the sidecar restarts.
  }
  return pair;
}

async function vapidAuth(privateJwk, publicKey, endpoint) {
  const key = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const head = b64url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = b64url(
    JSON.stringify({
      aud: new URL(endpoint).origin,
      exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
      sub: VAPID_CONTACT,
    }),
  );
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    Buffer.from(`${head}.${body}`),
  );
  return `vapid t=${head}.${body}.${b64url(sig)}, k=${publicKey}`;
}

export function createStudioPushMock(cacheDir) {
  let keypair = null;
  const subs = new Map();
  let customLine = "";

  async function keys() {
    if (keypair === null) keypair = await loadKeypair(cacheDir);
    return keypair;
  }

  async function sendTickle(endpoint) {
    const { privateJwk, publicKey } = await keys();
    let auth;
    try {
      auth = await vapidAuth(privateJwk, publicKey, endpoint);
    } catch (err) {
      console.error("dev vapid sign failed", err);
      return "retry";
    }
    let res;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: auth,
          TTL: "86400",
          Urgency: "normal",
          "Content-Length": "0",
        },
      });
    } catch (err) {
      console.error("dev push fetch failed", err);
      return "retry";
    }
    if (res.status === 404 || res.status === 410) return "gone";
    return res.ok ? "sent" : "retry";
  }

  async function handlePush(req) {
    if (req.method === "GET") {
      const { publicKey } = await keys();
      return json({ publicKey });
    }
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid request" }, { status: 400 });
    }
    if (
      body?.action === "subscribe" &&
      typeof body?.subscription?.endpoint === "string"
    ) {
      subs.set(body.subscription.endpoint, {
        p256dh: body.subscription.keys?.p256dh ?? "",
        auth: body.subscription.keys?.auth ?? "",
      });
      return json({ ok: true });
    }
    if (body?.action === "unsubscribe" && typeof body?.endpoint === "string") {
      subs.delete(body.endpoint);
      return json({ ok: true });
    }
    return json({ error: "Invalid request" }, { status: 400 });
  }

  async function handlePushMessage(req) {
    if (req.method !== "GET") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }
    return json({ body: customLine });
  }

  async function handleNotify(req) {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }
    let body;
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const pushOpt = body?.push;
    const isTickle = typeof pushOpt === "object" && pushOpt !== null;
    if (isTickle) {
      customLine = String(pushOpt.body ?? "")
        .trim()
        .slice(0, 180);
    }
    const wantPush = body?.push !== false;
    let sent = 0;
    let gone = 0;
    let failed = 0;
    let nextCursor = null;
    const total = wantPush ? subs.size : 0;
    if (wantPush) {
      // Same cursor batches as the live endpoint (40 per call).
      const all = [...subs.keys()];
      const cursor = isTickle
        ? Math.max(0, Math.floor(Number(pushOpt.cursor ?? 0)) || 0)
        : 0;
      const batch = isTickle ? all.slice(cursor, cursor + 40) : all;
      await Promise.all(
        batch.map(async (endpoint) => {
          const result = await sendTickle(endpoint);
          if (result === "sent") sent += 1;
          else if (result === "gone") {
            gone += 1;
            subs.delete(endpoint);
          } else failed += 1;
        }),
      );
      if (isTickle && cursor + batch.length < all.length)
        nextCursor = cursor + batch.length;
    }
    return json({
      sent,
      total,
      gone,
      failed,
      nextCursor,
      emailed: false,
      emailTotal: 0,
    });
  }

  return { handlePush, handlePushMessage, handleNotify };
}
