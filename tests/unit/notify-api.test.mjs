import { afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../../functions/api/notify.ts";

/**
 * Publish alerts and pings both page through the browser list, since one
 * Worker call on the free plan allows about 50 outbound requests. Tested
 * with an in-memory D1 stub and a stubbed push service.
 */

const realFetch = globalThis.fetch;
let pushed = [];
afterEach(() => {
  globalThis.fetch = realFetch;
  pushed = [];
});

/** Push service stub: endpoints listed in `goneSet` answer 410. */
function stubPushService(goneSet = new Set()) {
  globalThis.fetch = async (url) => {
    const endpoint = String(url);
    pushed.push(endpoint);
    if (goneSet.has(endpoint)) {
      return { ok: false, status: 410, text: async () => "gone" };
    }
    return { ok: true, status: 201, text: async () => "" };
  };
}

/** Just enough D1 for the notify endpoint: subscriptions plus the one
 * push_message row. */
function memoryDb(count) {
  const subs = Array.from({ length: count }, (_, i) => ({
    endpoint: `https://push.example.com/sub/${i}`,
    p256dh: "p",
    auth: "a",
  }));
  const message = { body: "Open studio Saturday!", title: "Studio news" };
  const db = {
    subs,
    message,
    prepare: (sql) => {
      const run = async (...args) => {
        if (sql.startsWith("DELETE FROM push_subscriptions")) {
          const at = subs.findIndex((s) => s.endpoint === args[0]);
          if (at >= 0) subs.splice(at, 1);
        } else if (sql.includes("INSERT INTO push_message (id, body, title)")) {
          message.body = args[0];
          message.title = args[1];
        }
        return {};
      };
      const first = async () => {
        if (sql.includes("COUNT(*)")) return { total: subs.length };
        return null;
      };
      const all = async (...args) => {
        if (sql.includes("LIMIT ? OFFSET ?")) {
          const [limit, offset] = args;
          return { results: subs.slice(offset, offset + limit) };
        }
        return { results: [...subs] };
      };
      return {
        all: () => all(),
        bind: (...args) => ({
          run: () => run(...args),
          first: () => first(...args),
          all: () => all(...args),
        }),
      };
    },
  };
  return db;
}

let vapid;
before(async () => {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", publicKey));
  vapid = {
    VAPID_PUBLIC_KEY: Buffer.from(raw).toString("base64url"),
    VAPID_PRIVATE_JWK: JSON.stringify(
      await crypto.subtle.exportKey("jwk", privateKey),
    ),
  };
});

function post(db, body) {
  return onRequestPost({
    request: new Request("https://barbart.ca/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env: { DB: db, ...vapid },
  });
}

/** Follows nextCursor the way the studio does, returning every reply. */
async function drain(db, first, next) {
  const replies = [];
  let r = await (await post(db, first)).json();
  replies.push(r);
  while (r.nextCursor !== null) {
    r = await (await post(db, next(r.nextCursor))).json();
    replies.push(r);
    assert.ok(replies.length < 20, "paging never ended");
  }
  return replies;
}

describe("publish alert", () => {
  it("pages a large list instead of one oversized call", async () => {
    stubPushService();
    const db = memoryDb(95);
    const replies = await drain(db, { push: true, email: false }, (cursor) => ({
      push: true,
      email: false,
      cursor,
    }));
    assert.equal(replies.length, 3);
    for (const r of replies) assert.ok(r.sent <= 40);
    assert.equal(
      replies.reduce((n, r) => n + r.sent, 0),
      95,
    );
    assert.equal(new Set(pushed).size, 95);
  });

  it("shows the standard text, not the last ping's", async () => {
    stubPushService();
    const db = memoryDb(3);
    await post(db, { push: true, email: false });
    assert.deepEqual(db.message, { body: "", title: "" });
  });

  it("reaches everyone when expired browsers drop out mid-list", async () => {
    // Every other browser in the first batch has expired. Deleting them
    // shifts the rest of the list, which must not skip anyone.
    const gone = new Set(
      Array.from(
        { length: 20 },
        (_, i) => `https://push.example.com/sub/${i * 2}`,
      ),
    );
    stubPushService(gone);
    const db = memoryDb(70);
    const replies = await drain(db, { push: true, email: false }, (cursor) => ({
      push: true,
      email: false,
      cursor,
    }));
    assert.equal(
      replies.reduce((n, r) => n + r.sent, 0),
      50,
    );
    assert.equal(new Set(pushed).size, 70);
    assert.equal(db.subs.length, 50);
  });
});

describe("ping", () => {
  it("keeps its custom text and pages the same way", async () => {
    stubPushService();
    const db = memoryDb(45);
    const replies = await drain(
      db,
      { push: { title: "Hi", body: "Open studio" }, email: false },
      (cursor) => ({
        push: { title: "Hi", body: "Open studio", cursor },
        email: false,
      }),
    );
    assert.equal(replies.length, 2);
    assert.equal(new Set(pushed).size, 45);
    assert.deepEqual(db.message, { body: "Open studio", title: "Hi" });
  });
});
