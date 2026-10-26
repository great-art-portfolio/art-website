import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { onRequestGet, onRequestPost } from "../../functions/api/collectors.ts";
import { issueLinkToken } from "../../functions/_lib/collectors.ts";

/**
 * Endpoint wiring tested with mock contexts and a stubbed fetch instead of
 * live Resend. Extensionless imports resolve through the test-only loader.
 */

const realFetch = globalThis.fetch;
let calls = [];
afterEach(() => {
  globalThis.fetch = realFetch;
  calls = [];
});

function stubFetch(handler) {
  globalThis.fetch = async (url, init) => {
    // The spam check passes; the deployed site always has one.
    if (String(url).startsWith("https://challenges.cloudflare.com/"))
      return Response.json({ success: true, hostname: "barbart.ca" });
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
  TURNSTILE_SECRET_KEY: "ts_test",
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
      body: JSON.stringify({ turnstileToken: "tok", ...body }),
    }),
    env: { ...env, ...envOverride },
  };
}

function emptyList() {
  return okJson({ object: "list", data: [] });
}

/** Resend stub with an empty list where writes succeed and deletes miss. */
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
      emailed: true,
    });
    const { email, token } = confirmLinkOf("fan@example.com");
    assert.equal(email, "fan@example.com");
    assert.ok(token);
  });

  it("answers an address already on the list like a new one", async () => {
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
    // Same status and body as a new join: nothing tells a stranger the
    // address is subscribed.
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { ok: true, emailed: true });
    // Its inbox hears it's already on the list, with no confirm link.
    const sent = sentEmails();
    assert.equal(sent.length, 1);
    assert.match(sent[0].subject, /already on the studio list/);
    assert.doesNotMatch(sent[0].text, /token=/);
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
    // Never deleted first: a failed re-add would drop a subscriber.
    assert.ok(!calls.some((c) => c.init?.method === "DELETE"));
    assert.ok(
      calls.some(
        (c) =>
          c.url === "https://api.resend.com/contacts" &&
          c.init.method === "POST",
      ),
    );
  });

  it("says so when Resend won't add them, so they can retry", async () => {
    stubEmptyList();
    await onRequestPost(postContext({ email: "fan@example.com" }));
    const { email, token } = confirmLinkOf("fan@example.com");
    stubFetch(() => failRes());
    const res = await onRequestPost(
      postContext({ action: "confirm", email, token }),
    );
    assert.equal(res.status, 500);
    assert.match((await res.json()).error, /tap the link again/);
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

  it("says goodbye from the modal button to a real member", async () => {
    stubFetch((url) => {
      if (url.includes("/segments/")) {
        return okJson({
          object: "list",
          data: [{ email: "fan@example.com", unsubscribed: false }],
        });
      }
      if (url.endsWith("/emails")) return okRes();
      if (url.includes("/contacts")) return okRes();
      return failRes();
    });
    const res = await onRequestPost(
      postContext({ action: "unsubscribe", email: "fan@example.com" }),
    );
    assert.equal(res.status, 200);
    const goodbye = sentEmails().find((m) => m.to.includes("fan@example.com"));
    assert.ok(goodbye);
  });

  it("mails nothing to a typed address that isn't on the list", async () => {
    stubEmptyList();
    const res = await onRequestPost(
      postContext({ action: "unsubscribe", email: "stranger@example.com" }),
    );
    // Same answer as for a member, so the list can't be probed.
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal(sentEmails().length, 0);
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
    // Broadcasts skip the unsubscribed, so the count does too.
    assert.deepEqual(await res.json(), { total: 1 });
  });

  it("refuses strangers", async () => {
    stubFetch(() => okRes());
    const res = await onRequestGet(getContext("wrong"));
    assert.equal(res.status, 401);
    assert.equal(calls.length, 0);
  });
});

describe("dev mock list", () => {
  /** Empty local table with no subscribers. */
  function stubCollectorsDb() {
    return {
      prepare: () => ({
        bind: () => ({
          first: async () => null,
          run: async () => ({}),
        }),
      }),
    };
  }

  function mockPostContext(body, envOverride = {}) {
    return {
      request: new Request("http://127.0.0.1:4331/api/collectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env: {
        COLLECTORS_MOCK: "true",
        RESEND_API_KEY: "re_test",
        ARTIST_INBOX: "studio@example.com",
        ARTIST_SENDER: "Gallery <studio@example.com>",
        SITE_URL: "https://barbart.ca",
        DB: stubCollectorsDb(),
        ...envOverride,
      },
    };
  }

  it("rides the real API for resend.dev test addresses", async () => {
    stubFetch(() => okRes());
    const res = await onRequestPost(
      mockPostContext({ email: "delivered+join@resend.dev" }),
    );
    assert.equal(res.status, 201);
    // The confirmation email went out through Resend,
    const mail = sentEmails().find((m) =>
      m.to.includes("delivered+join@resend.dev"),
    );
    assert.ok(mail, "no real confirm sent to the test address");
    // and the local confirm flow still completes from the same click.
    const data = await res.json();
    assert.match(
      data.devConfirmUrl,
      /^http:\/\/127\.0\.0\.1:4331\/email\/confirmed\?/,
    );
  });

  it("sends nothing real for ordinary addresses", async () => {
    stubFetch(() => okRes());
    const res = await onRequestPost(
      mockPostContext({ email: "fan@example.com" }),
    );
    assert.equal(res.status, 201);
    assert.equal(sentEmails().length, 0);
    const data = await res.json();
    assert.match(
      data.devConfirmUrl,
      /^http:\/\/127\.0\.0\.1:4331\/email\/confirmed\?/,
    );
  });

  it("stays fully local without a key", async () => {
    stubFetch(() => {
      throw new Error("must not send");
    });
    const res = await onRequestPost(
      mockPostContext(
        { email: "delivered+join@resend.dev" },
        { RESEND_API_KEY: "" },
      ),
    );
    // Tokens are keyed by the Resend secret, so the mock mints its own.
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.match(
      data.devConfirmUrl,
      /^http:\/\/127\.0\.0\.1:4331\/email\/confirmed\?/,
    );
  });
});

/** The studio's own list page: invite, remove, and see everyone. */
function studioPost(body, token = "admin_test") {
  return {
    request: new Request("https://barbart.ca/api/collectors", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    }),
    env,
  };
}

describe("studio list", () => {
  it("invites by sending the confirm email, with no spam check", async () => {
    stubEmptyList();
    const res = await onRequestPost(
      studioPost({ action: "invite", email: "met@example.com" }),
    );
    assert.equal(res.status, 201);
    const mail = sentEmails().find((m) => m.to.includes("met@example.com"));
    assert.ok(mail, "confirm email sent");
    assert.match(mail.text, /\/email\/confirmed\?email=/);
    // Nobody is added until they tap the link.
    assert.ok(!calls.some((c) => c.url === "https://api.resend.com/contacts"));
  });

  it("tells her when they're already on the list", async () => {
    stubFetch((url) =>
      url.includes("/segments/")
        ? okJson({ data: [{ email: "met@example.com", unsubscribed: false }] })
        : okRes(),
    );
    const res = await onRequestPost(
      studioPost({ action: "invite", email: "met@example.com" }),
    );
    assert.deepEqual(await res.json(), {
      ok: true,
      emailed: false,
      already: true,
    });
    assert.equal(sentEmails().length, 0);
  });

  it("removes without a goodbye email", async () => {
    stubEmptyList();
    const res = await onRequestPost(
      studioPost({ action: "remove", email: "fan@example.com" }),
    );
    assert.equal(res.status, 200);
    assert.ok(
      calls.some(
        (c) =>
          c.url === "https://api.resend.com/contacts/fan%40example.com" &&
          c.init.method === "DELETE",
      ),
    );
    assert.equal(sentEmails().length, 0);
  });

  it("needs her sign-in for invite and remove", async () => {
    stubEmptyList();
    for (const action of ["invite", "remove"]) {
      const res = await onRequestPost(
        studioPost({ action, email: "x@example.com" }, "wrong"),
      );
      assert.equal(res.status, 401);
    }
  });

  it("lists everyone with their state", async () => {
    stubFetch(() =>
      okJson({
        data: [
          {
            id: "1",
            email: "a@example.com",
            unsubscribed: false,
            created_at: "2026-10-01",
          },
          {
            id: "2",
            email: "b@example.com",
            unsubscribed: true,
            created_at: "2026-10-02",
          },
        ],
      }),
    );
    const res = await onRequestGet({
      request: new Request("https://barbart.ca/api/collectors?list=1", {
        headers: { authorization: "Bearer admin_test" },
      }),
      env,
    });
    const data = await res.json();
    assert.equal(data.total, 1);
    assert.deepEqual(
      data.contacts.map((c) => [c.email, c.unsubscribed]),
      [
        ["a@example.com", false],
        ["b@example.com", true],
      ],
    );
  });
});
