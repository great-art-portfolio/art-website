/**
 * "Tell me about new paintings" — Web Push subscription helper.
 * Works in Android Chrome + desktop browsers, and in iOS Safari 16.4+ for
 * sites added to the home screen. Unsupported browsers report as such.
 */

import { pushConfigSchema } from "./schemas";

export type PushState =
  "unsupported" | "denied" | "subscribed" | "unsubscribed";

/**
 * Fresh decoded bytes always sit in their own ArrayBuffer (never shared),
 * so the result qualifies as a BufferSource for PushManager — say so in
 * the return type instead of casting at the call site.
 */
function b64ToU8(base64url: string): Uint8Array<ArrayBuffer> {
  const bin = atob(base64url.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function supported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub === null ? "unsubscribed" : "subscribed";
  } catch {
    return "unsupported";
  }
}

/**
 * Why a subscribe attempt ended: granted and stored, the visitor dismissed
 * the browser prompt, the visitor (or an earlier choice) blocks alerts, or
 * something genuinely failed. Callers message each case in plain words —
 * a dismissal is never reported as a server problem.
 */
export type SubscribeResult =
  "subscribed" | "cancelled" | "blocked" | "failed" | "unavailable";

export async function subscribePush(): Promise<SubscribeResult> {
  if (!supported()) return "failed";
  try {
    const cfgRes = await fetch("/api/push");
    // No push endpoint here at all (a dev preview) — different from a
    // real failure, so callers can say so in plain words.
    if (!cfgRes.ok) return "unavailable";
    const raw = (await cfgRes.json()) as unknown;
    const parsed = pushConfigSchema.safeParse(raw);
    if (!parsed.success || parsed.data.publicKey === "") return "failed"; // Server keys not set up yet.
    const permission = await Notification.requestPermission();
    if (permission === "default") return "cancelled";
    if (permission !== "granted") return "blocked";
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToU8(parsed.data.publicKey),
      }));
    const res = await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "subscribe", subscription: sub.toJSON() }),
    });
    return res.ok ? "subscribed" : "failed";
  } catch {
    return "failed";
  }
}

export async function unsubscribePush(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub !== null) {
      await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unsubscribe", endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
    return true;
  } catch {
    return false;
  }
}
