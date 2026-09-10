/* Gallery service worker: offline shell + cached artwork + outbox replay.
 * Version the cache name on every behaviour change.
 */
const VERSION = "gallery-v1";
const STATIC_CACHE = `${VERSION}-static`;
const IMAGE_CACHE = `${VERSION}-images`;
const PRECACHE = ["/", "/offline", "/manifest.webmanifest", "/favicon.png"];
const IMAGE_LIMIT = 60;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function trimImages() {
  const cache = await caches.open(IMAGE_CACHE);
  const keys = await cache.keys();
  if (keys.length > IMAGE_LIMIT) {
    await cache.delete(keys[0]);
    await trimImages();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // POSTs are queued client-side.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The studio and the API are never cached: admin must always reflect
  // the live site, and API responses must never be served stale.
  if (
    url.pathname === "/admin" ||
    url.pathname.startsWith("/admin/") ||
    url.pathname.startsWith("/api/")
  )
    return;

  // Artwork images (built _astro/ assets): cache-first, so the gallery
  // works with spotty signal.
  if (url.pathname.startsWith("/_astro/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            const copy = res.clone();
            event.waitUntil(
              caches
                .open(IMAGE_CACHE)
                .then((cache) => cache.put(request, copy))
                .then(trimImages),
            );
            return res;
          }),
      ),
    );
    return;
  }

  // Pages: network-first, offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          event.waitUntil(
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy)),
          );
          return res;
        })
        .catch(() =>
          caches.match(request).then((hit) => hit ?? caches.match("/offline")),
        ),
    );
  }
});

// Background Sync: replay queued POSTs (views, inquiries) from IndexedDB.
function openOutbox() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("gallery-outbox", 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore("posts", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function replayOutbox() {
  let db;
  try {
    db = await openOutbox();
  } catch {
    return;
  }
  const posts = await new Promise((resolve, reject) => {
    const tx = db.transaction("posts", "readonly");
    const req = tx.objectStore("posts").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  for (const post of posts) {
    try {
      const res = await fetch(post.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: post.body,
      });
      if (!res.ok && res.status >= 400 && res.status < 500) {
        // Server rejected it — drop so it doesn't retry forever.
      } else if (!res.ok) {
        break;
      }
    } catch {
      break; // Still offline.
    }
    await new Promise((resolve, reject) => {
      const tx = db.transaction("posts", "readwrite");
      tx.objectStore("posts").delete(post.id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  db.close();
}

self.addEventListener("sync", (event) => {
  if (event.tag === "gallery-outbox") event.waitUntil(replayOutbox());
});

// Web Push "tickle": the server sends no body (no payload encryption),
// so the custom line is fetched — blank means the standard note. The
// tap opens the site's homepage, whatever origin that is in production.
self.addEventListener("push", (event) => {
  event.waitUntil(
    fetch("/api/push-message")
      .then((res) => (res.ok ? res.json() : {}))
      .catch(() => ({}))
      .then((msg) => {
        const line = msg && typeof msg.body === "string" ? msg.body.trim() : "";
        return self.registration.showNotification(
          "Something new in the gallery",
          {
            body: line === "" ? "Tap to see it." : line,
            icon: "/favicon.png",
            badge: "/favicon.png",
            tag: "new-painting",
            data: { url: "/" },
          },
        );
      }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((wins) => {
        for (const w of wins) {
          if (
            new URL(w.url).pathname ===
            new URL(url, self.location.origin).pathname
          ) {
            return w.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
