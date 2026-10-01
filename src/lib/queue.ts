/**
 * Offline POST outbox for view counts and buyer inquiries. Tries the
 * network first, then falls back to IndexedDB plus Background Sync, which
 * the service worker replays. Browsers without SyncManager flush on
 * `online` and on page load.
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
  const post: QueuedPost = {
    id: crypto.randomUUID(),
    path,
    body,
    ts: Date.now(),
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add(post);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  // Ask the service worker to replay soon.
  try {
    const reg = (await navigator.serviceWorker
      .ready) as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    };
    await reg.sync?.register(SYNC_TAG);
  } catch {
    // Background Sync is unsupported. flushOutbox on `online` covers it.
  }
}

let flushing = false;

export async function flushOutbox(): Promise<void> {
  // Concurrent flushes would send the same post twice.
  if (flushing) return;
  flushing = true;
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    flushing = false;
    return;
  }
  try {
    const posts: QueuedPost[] = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as QueuedPost[]);
      req.onerror = () => reject(req.error);
    });
    const drop = async (id: string): Promise<void> => {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    };
    for (const post of posts) {
      try {
        const res = await fetch(post.path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: post.body,
        });
        if (res.status >= 400 && res.status < 500) {
          // Rejected by the server, such as bad input or an expired spam
          // check. Retrying won't help.
          await drop(post.id);
          continue;
        }
        if (!res.ok) continue; // Server error. Keep it for a later retry.
      } catch {
        break; // Still offline. Try again next time.
      }
      await drop(post.id);
    }
    db.close();
  } finally {
    flushing = false;
  }
}

/** POSTs JSON, queuing it when offline. Doesn't throw. */
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
    // A 4xx means the server rejected it, such as bad input or a sold
    // painting, so don't queue it.
    if (res.status >= 400 && res.status < 500) return "rejected";
    await enqueue(path, body);
    return "queued";
  } catch {
    try {
      await enqueue(path, body);
    } catch {
      // IndexedDB is unavailable, as in private mode.
    }
    return "queued";
  }
}

let armed = false;

export function armOutboxFlush(): void {
  // Client-side navigation re-runs page init, so arm once per session.
  if (armed) return;
  armed = true;
  window.addEventListener("online", () => void flushOutbox());
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void flushOutbox());
  } else {
    void flushOutbox();
  }
}
