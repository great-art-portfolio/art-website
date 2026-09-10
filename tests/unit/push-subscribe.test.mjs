import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { subscribePush } from "../../src/lib/push.ts";

/** subscribePush maps a dead push service to its own plain-words result. */

const realFetch = globalThis.fetch;
const realNavigator = Object.getOwnPropertyDescriptor(
  globalThis,
  "navigator",
);

afterEach(() => {
  globalThis.fetch = realFetch;
  delete globalThis.window;
  delete globalThis.Notification;
  if (realNavigator !== undefined) {
    Object.defineProperty(globalThis, "navigator", realNavigator);
  } else {
    delete globalThis.navigator;
  }
});

function stageBrowser(subscribe) {
  const pushManager = {
    getSubscription: async () => null,
    subscribe,
  };
  // Node's built-in navigator is getter-only — define, don't assign.
  Object.defineProperty(globalThis, "navigator", {
    value: { serviceWorker: { ready: Promise.resolve({ pushManager }) } },
    configurable: true,
    writable: true,
  });
  globalThis.window = { PushManager: function () {}, Notification: {} };
  globalThis.Notification = { requestPermission: async () => "granted" };
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/api/push")) {
      return { ok: true, json: async () => ({ publicKey: "dev-key" }) };
    }
    throw new Error("unexpected fetch");
  };
}

describe("subscribePush push-service failure", () => {
  it("reports nopushservice when registration blames the push service", async () => {
    stageBrowser(async () => {
      throw new DOMException(
        "Registration failed - push service error",
        "AbortError",
      );
    });
    assert.equal(await subscribePush(), "nopushservice");
  });

  it("reports failed for anything else", async () => {
    stageBrowser(async () => {
      throw new Error("boom");
    });
    assert.equal(await subscribePush(), "failed");
  });
});
