/**
 * Web Push subscription for new-painting alerts. Works in Android Chrome,
 * desktop browsers, and iOS Safari 16.4+ when added to the home screen.
 */

import { pushConfigSchema } from "./schemas";

export type PushState =
  "unsupported" | "denied" | "subscribed" | "unsubscribed";

/**
 * Decodes base64url into a Uint8Array backed by its own ArrayBuffer. The
 * return type says so, which lets PushManager accept it without a cast.
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
 * Outcome of a subscribe attempt: subscribed, prompt dismissed, permission
 * blocked, or a real failure. Callers word each case differently so a
 * dismissal isn't reported as a server problem.
 */
export type SubscribeResult =
  | "subscribed"
  | "cancelled"
  | "blocked"
  | "failed"
  | "unavailable"
  | "nopushservice";

export async function subscribePush(): Promise<SubscribeResult> {
  if (!supported()) return "failed";
  // Tracks the current step for console logging, since the page only shows
  // a friendly message.
  let stage = "config";
  try {
    const cfgRes = await fetch("/api/push");
    // No push endpoint, as in a dev preview. Reported separately from a
    // real failure.
    if (!cfgRes.ok) return "unavailable";
    const raw = (await cfgRes.json()) as unknown;
    const parsed = pushConfigSchema.safeParse(raw);
    if (!parsed.success || parsed.data.publicKey === "") return "failed"; // Server keys not set up yet.
    stage = "permission";
    const permission = await Notification.requestPermission();
    if (permission === "default") return "cancelled";
    if (permission !== "granted") return "blocked";
    stage = "service-worker";
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToU8(parsed.data.publicKey),
      }));
    stage = "store";
    const res = await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "subscribe", subscription: sub.toJSON() }),
    });
    return res.ok ? "subscribed" : "failed";
  } catch (err) {
    console.warn(`push subscribe failed at ${stage}`, err);
    // The browser couldn't reach its push service, for example because
    // it's blocked on the network or disabled. This isn't a site error.
    if (
      err instanceof DOMException &&
      err.name === "AbortError" &&
      /push service/i.test(err.message)
    ) {
      return "nopushservice";
    }
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
