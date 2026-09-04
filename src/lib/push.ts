/**
 * "Tell me about new paintings" — Web Push subscription helper.
 * Works in Android Chrome + desktop browsers, and in iOS Safari 16.4+ for
 * sites added to the home screen. Unsupported browsers report as such.
 */

export type PushState = "unsupported" | "denied" | "subscribed" | "unsubscribed";

function b64ToU8(base64url: string): Uint8Array {
  const bin = atob(base64url.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function supported(): boolean {
  return (
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
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

export async function subscribePush(): Promise<boolean> {
  if (!supported()) return false;
  try {
    const config = (await (await fetch("/api/push")).json()) as { publicKey: string };
    if (config.publicKey === "") return false; // Server keys not set up yet.
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToU8(config.publicKey).buffer as ArrayBuffer,
      }));
    const res = await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "subscribe", subscription: sub.toJSON() }),
    });
    return res.ok;
  } catch {
    return false;
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
