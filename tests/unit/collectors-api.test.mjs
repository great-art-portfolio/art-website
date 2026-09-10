import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { onRequestGet, onRequestPost } from "../../functions/api/collectors.ts";
import { issueLinkToken } from "../../functions/_lib/collectors.ts";

/** Endpoint wiring through mock contexts and stubbed fetch (no live Resend).
 * Extensionless imports resolve via the test-only loader. */

const realFetch = globalThis.fetch;
let calls = [];
afterEach(() => {
  globalThis.fetch = realFetch;
  calls = [];
});

function stubFetch(handler) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
}

const okJson = (data) => ({
  ok: true,
  status: 200,
  text: async () => "",
  json: async () => data,
});
const okRes = () => okJson({});
const failRes = () => ({ ok: false, status: 400, text: async () => "bad" });
const goneRes = () => ({ ok: false, status: 404, text: async () => "gone" });

const env = {
  RESEND_API_KEY: "re_test",
  RESEND_SEGMENT_ID: "seg_123",
  ARTIST_INBOX: "studio@example.com",
  ARTIST_SENDER: "Gallery <studio@example.com>",
  SITE_URL: "https://barbart.ca",
  ADMIN_API_TOKEN: "admin_test",
};

function postContext(body, envOverride = {}) {
  return {
    request: new Request("https://barbart.ca/api/collectors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env: { ...env, ...envOverride },
  };
}

function emptyList() {
  return okJson({ object: "list", data: [] });
}

/** Resend stub: empty list, every write succeeds, delete misses. */
function stubEmptyList() {
  stubFetch((url, init) => {
    if (url.includes("/segments/")) return emptyList();
    if (url.endsWith("/emails")) return okRes();
    if (url.includes("/contacts")) {
      return init?.method === "DELETE" ? goneRes() : okRes();
    }
    return failRes();
  });
}

function sentEmails() {
  return calls
    .filter((c) => c.url.endsWith("/emails"))
    .map((c) => JSON.parse(c.init.body));
}

function confirmLinkOf(email) {
  const mail = sentEmails().find((m) => m.to.includes(email));
  assert.ok(mail, `no email sent to ${email}`);
  const url = new URL(mail.text.match(/https:\/\/\S+/)[0]);
  return {
    email: url.searchParams.get("email"),
    token: url.searchParams.get("token"),
  };
}

describe("subscribe", () => {
  it("rejects a bad address before touching Resend", async () => {
    stubFetch(() => okRes());
    const res = await onRequestPost(postContext({ email: "nope" }));
    assert.equal(res.status, 400);
    assert.equal(calls.length, 0);
  });

  it("fails loudly without a key", async () => {
    stubFetch(() => okRes());
    const res = await onRequestPost(
      postContext({ email: "fan@example.com" }, { RESEND_API_KEY: "" }),
    );
    assert.equal(res.status, 500);
    assert.equal(calls.length, 0);
  });

  it("emails a confirmation link to a new address", async () => {
    stubEmptyList();
    const res = await onRequestPost(postContext({ email: "fan@example.com" }));
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), {
      ok: true,
      already: false,
      emailed: true,
    });
    const { email, token } = confirmLinkOf("fan@example.com");
    assert.equal(email, "fan@example.com");
    assert.ok(token);
  });

  it("sends nothing when the address is already confirmed", async () => {
    stubFetch((url) => {
      if (url.includes("/segments/")) {
        return okJson({
          object: "list",
          data: [{ email: "fan@example.com", unsubscribed: false }],
        });
      }
      if (url.endsWith("/emails")) return okRes();
      return failRes();
    });
    const res = await onRequestPost(postContext({ email: "fan@example.com" }));
    assert.deepEqual(await res.json(), {
      ok: true,
      already: true,
      emailed: true,
    });
    assert.equal(sentEmails().length, 0);
  });
});

describe("confirm", () => {
  it("joins the segment on a full round trip", async () => {
    stubEmptyList();
    const sub = await onRequestPost(postContext({ email: "fan@example.com" }));
    assert.equal(sub.status, 201);
    const { email, token } = confirmLinkOf("fan@example.com");
    const res = await onRequestPost(
      postContext({ action: "confirm", email, token }),
    );
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.ok(
      calls.some(
        (c) =>
          c.url === "https://api.resend.com/contacts/fan%40example.com" &&
          c.init.method === "DELETE",
      ),
    );
    assert.ok(
      calls.some(
        (c) =>
          c.url === "https://api.resend.com/contacts" &&
          c.init.method === "POST",
      ),
    );
  });

  it("rejects tampered and expired links", async () => {
    stubEmptyList();
    const bad = await onRequestPost(
      postContext({ action: "confirm", email: "fan@example.com", token: "x" }),
    );
    assert.equal(bad.status, 400);
    const old = await issueLinkToken(
      env,
      "fan@example.com",
      "confirm",
      Date.now() - 8 * 24 * 60 * 60 * 1000,
    );
    const stale = await onRequestPost(
      postContext({ action: "confirm", email: "fan@example.com", token: old }),
    );
    assert.equal(stale.status, 400);
  });
});

describe("unsubscribe", () => {
  it("removes by link and says goodbye", async () => {
    stubEmptyList();
    const token = await issueLinkToken(env, "fan@example.com", "goodbye");
    const res = await onRequestPost(
      postContext({ action: "unsubscribe", email: "fan@example.com", token }),
    );
    assert.equal(res.status, 200);
    assert.ok(
      calls.some(
        (c) =>
          c.url === "https://api.resend.com/contacts/fan%40example.com" &&
          c.init.method === "DELETE",
      ),
    );
    const goodbye = sentEmails().find((m) => m.to.includes("fan@example.com"));
    assert.ok(goodbye);
    assert.match(goodbye.subject, /Removed/);
  });

  it("removes by address from the modal button", async () => {
    stubEmptyList();
    const res = await onRequestPost(
      postContext({ action: "unsubscribe", email: "fan@example.com" }),
    );
    assert.equal(res.status, 200);
    assert.ok(
      calls.some(
        (c) =>
          c.url === "https://api.resend.com/contacts/fan%40example.com" &&
          c.init.method === "DELETE",
      ),
    );
  });

  it("rejects a forged link", async () => {
    stubEmptyList();
    const res = await onRequestPost(
      postContext({
        action: "unsubscribe",
        email: "fan@example.com",
        token: "forged",
      }),
    );
    assert.equal(res.status, 400);
  });
});

describe("admin count", () => {
  function getContext(token) {
    return {
      request: new Request("https://barbart.ca/api/collectors", {
        headers: token === null ? {} : { Authorization: `Bearer ${token}` },
      }),
      env,
    };
  }

  it("counts the segment behind the token", async () => {
    stubFetch((url) => {
      if (url.includes("/segments/")) {
        return okJson({
          object: "list",
          data: [
            { email: "a@example.com", unsubscribed: false },
            { email: "b@example.com", unsubscribed: true },
          ],
        });
      }
      return failRes();
    });
    const res = await onRequestGet(getContext("admin_test"));
    assert.deepEqual(await res.json(), { total: 2 });
  });

  it("refuses strangers", async () => {
    stubFetch(() => okRes());
    const res = await onRequestGet(getContext("wrong"));
    assert.equal(res.status, 401);
    assert.equal(calls.length, 0);
  });
});
