import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  artistInbox,
  artistSender,
  isConfirmedContact,
  listSegmentContacts,
  segmentBroadcastEmail,
  segmentId,
  sendCollectorBroadcast,
  sendSegmentBroadcast,
  syncContactRemoved,
  syncContactSubscribed,
} from "../../functions/_lib/notify.ts";

const realFetch = globalThis.fetch;
let calls = [];
afterEach(() => {
  globalThis.fetch = realFetch;
  calls = [];
});

function stubFetch(handler) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
}

const okRes = () => ({ ok: true, status: 200, text: async () => "" });
const failRes = () => ({ ok: false, status: 400, text: async () => "bad" });

const fullEnv = {
  RESEND_API_KEY: "re_test",
  RESEND_SEGMENT_ID: "seg_123",
  ARTIST_INBOX: "studio@example.com",
  ARTIST_SENDER: "Gallery <studio@example.com>",
};

describe("artistInbox", () => {
  it("reads the inbox", () => {
    assert.equal(
      artistInbox({ ARTIST_INBOX: "studio@example.com" }),
      "studio@example.com",
    );
  });

  it("is empty when unset", () => {
    assert.equal(artistInbox({}), "");
  });
});

describe("artistSender", () => {
  it("reads the sender", () => {
    assert.equal(
      artistSender({ ARTIST_SENDER: "Gallery <studio@example.com>" }),
      "Gallery <studio@example.com>",
    );
  });

  it("defaults to the onboarding identity", () => {
    assert.equal(artistSender({}), "Gallery <onboarding@resend.dev>");
  });
});

describe("segmentId", () => {
  it("reads the segment", () => {
    assert.equal(segmentId(fullEnv), "seg_123");
  });

  it("is empty when unset", () => {
    assert.equal(segmentId({}), "");
  });
});

describe("segmentBroadcastEmail", () => {
  it("uses Resend's unsubscribe placeholder, not per-recipient links", () => {
    const { subject, text } = segmentBroadcastEmail("https://barbart.ca");
    assert.equal(subject, "New painting at Barbara Straka's studio");
    assert.match(text, /https:\/\/barbart\.ca/);
    assert.match(text, /— Barbara/);
    assert.ok(text.includes("{{{RESEND_UNSUBSCRIBE_URL}}}"));
    assert.ok(!text.includes("token="));
  });
});

describe("sendSegmentBroadcast", () => {
  it("creates and sends one broadcast to the segment", async () => {
    stubFetch(() => okRes());
    assert.equal(
      await sendSegmentBroadcast(fullEnv, "https://barbart.ca"),
      true,
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.resend.com/broadcasts");
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.segment_id, "seg_123");
    assert.equal(body.from, "Gallery <studio@example.com>");
    assert.equal(body.reply_to, "studio@example.com");
    assert.equal(body.send, true);
    assert.ok(body.text.includes("{{{RESEND_UNSUBSCRIBE_URL}}}"));
  });

  it("stays quiet without a key, segment, or inbox", async () => {
    stubFetch(() => okRes());
    assert.equal(await sendSegmentBroadcast({}, "https://barbart.ca"), false);
    assert.equal(
      await sendSegmentBroadcast(
        { ...fullEnv, RESEND_SEGMENT_ID: "" },
        "https://barbart.ca",
      ),
      false,
    );
    assert.equal(
      await sendSegmentBroadcast(
        { ...fullEnv, ARTIST_INBOX: "" },
        "https://barbart.ca",
      ),
      false,
    );
    assert.equal(calls.length, 0);
  });

  it("reports a rejected broadcast", async () => {
    stubFetch(() => failRes());
    assert.equal(
      await sendSegmentBroadcast(fullEnv, "https://barbart.ca"),
      false,
    );
  });
});

describe("sendCollectorBroadcast", () => {
  const segmentList = (emails) => ({
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({
      object: "list",
      data: emails.map((email) => ({ email, unsubscribed: false })),
    }),
  });

  it("counts the segment then sends one broadcast", async () => {
    stubFetch((url) =>
      String(url).includes("/broadcasts")
        ? okRes()
        : segmentList(["a@example.com", "b@example.com", "c@example.com"]),
    );
    const result = await sendCollectorBroadcast(fullEnv, "https://barbart.ca");
    assert.deepEqual(result, { sent: 3, total: 3 });
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, "https://api.resend.com/broadcasts");
  });

  it("sends nothing to an empty list", async () => {
    stubFetch((url) =>
      String(url).includes("/broadcasts") ? okRes() : segmentList([]),
    );
    const result = await sendCollectorBroadcast(fullEnv, "https://barbart.ca");
    assert.deepEqual(result, { sent: 0, total: 0 });
    assert.equal(calls.length, 1);
  });

  it("reports a rejected broadcast", async () => {
    stubFetch((url) =>
      String(url).includes("/broadcasts")
        ? failRes()
        : segmentList(["a@example.com"]),
    );
    const result = await sendCollectorBroadcast(fullEnv, "https://barbart.ca");
    assert.deepEqual(result, { sent: 0, total: 1 });
  });
});

describe("listSegmentContacts", () => {
  it("reads addresses and flags from the segment", async () => {
    stubFetch(() => ({
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({
        object: "list",
        data: [
          { email: "a@example.com", unsubscribed: false },
          { email: "b@example.com", unsubscribed: true },
          { email: 42, unsubscribed: false },
        ],
      }),
    }));
    assert.deepEqual(await listSegmentContacts(fullEnv), [
      { email: "a@example.com", unsubscribed: false },
      { email: "b@example.com", unsubscribed: true },
    ]);
  });

  it("is empty when unconfigured or rejected", async () => {
    stubFetch(() => failRes());
    assert.deepEqual(await listSegmentContacts(fullEnv), []);
    stubFetch(() => okRes());
    assert.deepEqual(await listSegmentContacts({}), []);
  });
});

describe("isConfirmedContact", () => {
  it("is true only for subscribed addresses", async () => {
    stubFetch(() => ({
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({
        object: "list",
        data: [{ email: "a@example.com", unsubscribed: false }],
      }),
    }));
    assert.equal(await isConfirmedContact(fullEnv, "a@example.com"), true);
    assert.equal(await isConfirmedContact(fullEnv, "b@example.com"), false);
  });
});

describe("syncContactSubscribed", () => {
  it("creates the contact inside the segment", async () => {
    stubFetch(() => okRes());
    assert.equal(await syncContactSubscribed(fullEnv, "fan@example.com"), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.resend.com/contacts");
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.email, "fan@example.com");
    assert.equal(body.unsubscribed, false);
    assert.deepEqual(body.segments, [{ id: "seg_123" }]);
  });

  it("adds the existing contact to the segment when creation fails", async () => {
    stubFetch((url) =>
      String(url) === "https://api.resend.com/contacts" ? failRes() : okRes(),
    );
    assert.equal(await syncContactSubscribed(fullEnv, "fan@example.com"), true);
    assert.equal(calls.length, 2);
    assert.equal(
      calls[1].url,
      "https://api.resend.com/contacts/fan%40example.com/segments/seg_123",
    );
  });

  it("stays quiet without a key or segment", async () => {
    stubFetch(() => okRes());
    assert.equal(await syncContactSubscribed({}, "fan@example.com"), false);
    assert.equal(
      await syncContactSubscribed(
        { ...fullEnv, RESEND_SEGMENT_ID: "" },
        "fan@example.com",
      ),
      false,
    );
    assert.equal(calls.length, 0);
  });
});

describe("syncContactRemoved", () => {
  it("deletes the contact by address", async () => {
    stubFetch(() => okRes());
    assert.equal(await syncContactRemoved(fullEnv, "fan@example.com"), true);
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      "https://api.resend.com/contacts/fan%40example.com",
    );
    assert.equal(calls[0].init.method, "DELETE");
  });

  it("treats a missing contact as already gone", async () => {
    stubFetch(() => ({ ok: false, status: 404, text: async () => "nope" }));
    assert.equal(await syncContactRemoved(fullEnv, "fan@example.com"), true);
  });

  it("stays quiet without a key or segment", async () => {
    stubFetch(() => okRes());
    assert.equal(await syncContactRemoved({}, "fan@example.com"), false);
    assert.equal(calls.length, 0);
  });
});
