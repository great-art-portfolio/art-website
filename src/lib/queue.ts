/**
 * Offline POST outbox: tries the network first, falls back to IndexedDB +
 * Background Sync (replayed by the service worker), plus a flush on
 * `online` / page load for browsers without SyncManager. Used for view
 * counts and buyer inquiries — the gallery keeps working on the
 * Calgary–Edmonton drive.
 */

const DB_NAME = "gallery-outbox";
const STORE = "posts";
const SYNC_TAG = "gallery-outbox";

interface QueuedPost {
  id: string;
  path: string;
  body: string;
  ts: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function enqueue(path: string, body: string): Promise<void> {
  const db = await openDb();
  const post: QueuedPost = { id: crypto.randomUUID(), path, body, ts: Date.now() };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add(post);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  // Nudge the service worker to replay ASAP (no-op where unsupported).
  try {
    const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    };
    await reg.sync?.register(SYNC_TAG);
  } catch {
    // Background Sync unsupported — flushOutbox on `online` covers it.
  }
}

export async function flushOutbox(): Promise<void> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return;
  }
  const posts: QueuedPost[] = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as QueuedPost[]);
    req.onerror = () => reject(req.error);
  });
  for (const post of posts) {
    try {
      const res = await fetch(post.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: post.body,
      });
      if (!res.ok) continue; // Server said no — keep it for a later retry.
    } catch {
      break; // Still offline — stop, try again next time.
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(post.id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  db.close();
}

/** POST JSON, queuing offline instead of failing. Never throws. */
export async function queuePost(
  path: string,
  payload: unknown,
): Promise<"sent" | "queued" | "rejected"> {
  const body = JSON.stringify(payload);
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (res.ok) return "sent";
    // 4xx = server rejected it (bad input, sold painting); queuing is wrong.
    if (res.status >= 400 && res.status < 500) return "rejected";
    await enqueue(path, body);
    return "queued";
  } catch {
    try {
      await enqueue(path, body);
    } catch {
      // IndexedDB unavailable (private mode) — nothing more we can do.
    }
    return "queued";
  }
}

export function armOutboxFlush(): void {
  window.addEventListener("online", () => void flushOutbox());
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void flushOutbox());
  } else {
    void flushOutbox();
  }
}
