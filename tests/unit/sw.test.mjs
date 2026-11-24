import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SW_SOURCE = readFileSync("public/sw.js", "utf8");

function loadSw({ outboxRows = [], fetchImpl } = {}) {
  const listeners = new Map();
  const stores = new Map();
  let dbClosed = 0;

  const openCache = (name) => {
    let entries = stores.get(name);
    if (entries === undefined) {
      entries = new Map();
      stores.set(name, entries);
    }
    return {
      async addAll(items) {
        for (const item of items) entries.set(String(item), { ok: true });
      },
      async keys() {
        return [...entries.keys()];
      },
      async put(req, res) {
        const key = typeof req === "string" ? req : req.url;
        entries.set(key, res);
      },
      async delete(req) {
        const key = typeof req === "string" ? req : req.url;
        return entries.delete(key);
      },
      async match(req) {
        const key = typeof req === "string" ? req : req.url;
        return entries.get(key);
      },
    };
  };

  const caches = {
    async open(name) {
      return openCache(name);
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    },
    async match(req) {
      const key = typeof req === "string" ? req : req.url;
      for (const map of stores.values()) {
        if (map.has(key)) return map.get(key);
      }
      return undefined;
    },
  };

  const db = {
    transaction(storeName, mode) {
      const tx = {
        oncomplete: null,
        onerror: null,
        objectStore() {
          if (mode === "readonly") {
            return {
              getAll() {
                const req = { onsuccess: null, onerror: null, result: null };
                queueMicrotask(() => {
                  req.result = [...outboxRows];
                  req.onsuccess?.();
                });
                return req;
              },
            };
          }
          return {
            delete(id) {
              const idx = outboxRows.findIndex((r) => r.id === id);
              if (idx !== -1) outboxRows.splice(idx, 1);
              queueMicrotask(() => tx.oncomplete?.());
            },
          };
        },
      };
      void storeName;
      return tx;
    },
    close() {
      dbClosed += 1;
    },
  };

  const indexedDB = {
    open() {
      const req = { onupgradeneeded: null, onsuccess: null, onerror: null };
      queueMicrotask(() => {
        req.result = db;
        req.onsuccess?.();
      });
      return req;
    },
  };

  const self = {
    location: { origin: "https://barbart.ca" },
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
    addEventListener(type, fn) {
      listeners.set(type, fn);
    },
  };

  const context = {
    self,
    caches,
    indexedDB,
    URL,
    fetch:
      fetchImpl ??
      (async () => ({
        ok: true,
        status: 200,
        clone() {
          return this;
        },
      })),
  };

  vm.runInNewContext(SW_SOURCE, context);
  return {
    listeners,
    stores,
    dbClosed: () => dbClosed,
    outboxRows,
  };
}

describe("public/sw.js", () => {
  it("never caches email confirmation/goodbye or tokenized navigation URLs", () => {
    const { listeners } = loadSw();
    const onFetch = listeners.get("fetch");
    for (const url of [
      "https://barbart.ca/email/confirmed?email=a&token=secret",
      "https://barbart.ca/fr/email/goodbye?email=a&token=secret",
      "https://barbart.ca/paintings/first-thaw?token=secret",
      "https://barbart.ca/admin",
    ]) {
      let responded = false;
      onFetch({
        request: { method: "GET", mode: "navigate", url },
        respondWith() {
          responded = true;
        },
        waitUntil() {},
      });
      assert.equal(responded, false, url);
    }
  });

  it("caps code asset cache size across deploys", async () => {
    const { listeners, stores } = loadSw();
    const onFetch = listeners.get("fetch");
    for (let i = 0; i < 65; i += 1) {
      const waits = [];
      let responsePromise;
      onFetch({
        request: {
          method: "GET",
          mode: "cors",
          url: `https://barbart.ca/_astro/chunk-${i}.js`,
        },
        respondWith(p) {
          responsePromise = p;
        },
        waitUntil(p) {
          waits.push(p);
        },
      });
      await responsePromise;
      await Promise.all(waits);
    }
    const codeEntries = stores.get("gallery-v4-code");
    assert.ok(codeEntries);
    assert.equal(codeEntries.size, 60);
    assert.equal(
      codeEntries.has("https://barbart.ca/_astro/chunk-0.js"),
      false,
    );
    assert.equal(
      codeEntries.has("https://barbart.ca/_astro/chunk-64.js"),
      true,
    );
  });

  it("closes IndexedDB and drops non-/api/ outbox entries on replay", async () => {
    const fetched = [];
    const { listeners, dbClosed, outboxRows } = loadSw({
      outboxRows: [
        { id: 1, path: "https://evil.example/steal", body: "{}" },
        { id: 2, path: "/api/inquiries", body: "{}" },
      ],
      fetchImpl: async (path) => {
        fetched.push(path);
        throw new Error("offline");
      },
    });
    const onSync = listeners.get("sync");
    let done;
    onSync({
      tag: "gallery-outbox",
      waitUntil(p) {
        done = p;
      },
    });
    await done;
    assert.deepEqual(fetched, ["/api/inquiries"]);
    assert.deepEqual(
      outboxRows.map((r) => r.id),
      [2],
    );
    assert.equal(dbClosed(), 1);
  });
});
