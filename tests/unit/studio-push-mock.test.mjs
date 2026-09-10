import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStudioPushMock } from "../../scripts/studio-push-mock.mjs";

/** Dev push mock: keypair, subscribe loop, tickle fan-out (no socket). */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(handler) {
  globalThis.fetch = async (url, init) => handler(String(url), init);
}

const okTickle = () => ({ ok: true, status: 200, text: async () => "" });

async function cacheDir() {
  return mkdtemp(join(tmpdir(), "studio-push-"));
}

function post(path, body) {
  return new Request(`http://127.0.0.1${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const SUB = {
  endpoint: "https://push.example.com/sub/1",
  keys: { p256dh: "dh", auth: "a" },
};

describe("studio push mock", () => {
  it("serves a valid P-256 public key", async () => {
    const mock = createStudioPushMock(await cacheDir());
    const res = await mock.handlePush(new Request("http://127.0.0.1/api/push"));
    assert.equal(res.status, 200);
    const raw = Buffer.from((await res.json()).publicKey, "base64url");
    assert.equal(raw.length, 65);
    assert.equal(raw[0], 4);
  });

  it("reuses the cached keypair across instances", async () => {
    const dir = await cacheDir();
    const first = await (
      await createStudioPushMock(dir).handlePush(
        new Request("http://127.0.0.1/api/push"),
      )
    ).json();
    const second = await (
      await createStudioPushMock(dir).handlePush(
        new Request("http://127.0.0.1/api/push"),
      )
    ).json();
    assert.equal(first.publicKey, second.publicKey);
  });

  it("subscribes, counts, and unsubscribes", async () => {
    const mock = createStudioPushMock(await cacheDir());
    stubFetch(() => okTickle());
    let res = await mock.handlePush(
      post("/api/push", { action: "subscribe", subscription: SUB }),
    );
    assert.equal(res.status, 200);
    res = await mock.handleNotify(
      post("/api/notify", { push: true, email: false }),
    );
    assert.deepEqual(await res.json(), {
      sent: 1,
      total: 1,
      gone: 0,
      failed: 0,
      nextCursor: null,
      emailed: false,
      emailTotal: 0,
    });
    res = await mock.handlePush(
      post("/api/push", { action: "unsubscribe", endpoint: SUB.endpoint }),
    );
    assert.equal(res.status, 200);
    res = await mock.handleNotify(
      post("/api/notify", { push: true, email: false }),
    );
    assert.deepEqual((await res.json()).total, 0);
  });

  it("rejects junk bodies", async () => {
    const mock = createStudioPushMock(await cacheDir());
    const res = await mock.handlePush(post("/api/push", { action: "nope" }));
    assert.equal(res.status, 400);
  });

  it("signs tickles with a vapid header and drops gone subs", async () => {
    const mock = createStudioPushMock(await cacheDir());
    const seen = [];
    stubFetch((url, init) => {
      seen.push(init.headers);
      return url.endsWith("/sub/1")
        ? { ok: false, status: 410, text: async () => "gone" }
        : okTickle();
    });
    await mock.handlePush(
      post("/api/push", { action: "subscribe", subscription: SUB }),
    );
    await mock.handlePush(
      post("/api/push", {
        action: "subscribe",
        subscription: { ...SUB, endpoint: "https://push.example.com/sub/2" },
      }),
    );
    const res = await mock.handleNotify(
      post("/api/notify", { push: true, email: false }),
    );
    assert.deepEqual(await res.json(), {
      sent: 1,
      total: 2,
      gone: 1,
      failed: 0,
      nextCursor: null,
      emailed: false,
      emailTotal: 0,
    });
    assert.match(seen[0].Authorization, /^vapid t=.+\..+\..+, k=.+$/);
    assert.equal(seen[0].TTL, "86400");
  });

  it("stores the custom line for the service worker", async () => {
    const mock = createStudioPushMock(await cacheDir());
    await mock.handleNotify(
      post("/api/notify", { push: { body: "  Hello dev  " }, email: false }),
    );
    const res = await mock.handlePushMessage(
      new Request("http://127.0.0.1/api/push-message"),
    );
    assert.deepEqual(await res.json(), { body: "Hello dev" });
  });

  it("skips the fan-out when push is off", async () => {
    const mock = createStudioPushMock(await cacheDir());
    stubFetch(() => {
      throw new Error("must not send");
    });
    await mock.handlePush(
      post("/api/push", { action: "subscribe", subscription: SUB }),
    );
    const res = await mock.handleNotify(post("/api/notify", { push: false }));
    assert.deepEqual((await res.json()).total, 0);
  });
});
