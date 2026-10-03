import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { turnstileOk } from "../../functions/_lib/turnstile.ts";

/**
 * Backend siteverify requests, with fetch stubbed instead of calling
 * Cloudflare. Extensionless imports resolve through the test-only loader.
 */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubSiteverify(answer) {
  globalThis.fetch = async (url, init) => {
    assert.equal(
      String(url),
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    );
    assert.equal(init?.method, "POST");
    assert.equal(
      init?.headers?.["Content-Type"],
      "application/x-www-form-urlencoded",
    );
    const form = new URLSearchParams(String(init?.body));
    assert.equal(form.get("secret"), "shh");
    assert.ok((form.get("response") ?? "").length > 0);
    return { json: async () => answer };
  };
}

describe("turnstileOk", () => {
  it("passes without a secret (honeypot-only local/dev)", async () => {
    assert.equal(await turnstileOk({}, "", null), true);
  });

  it("rejects empty and oversize tokens before calling siteverify", async () => {
    let called = 0;
    globalThis.fetch = async () => {
      called += 1;
      return { json: async () => ({ success: true }) };
    };
    const env = { TURNSTILE_SECRET_KEY: "shh" };
    assert.equal(await turnstileOk(env, "", null), false);
    assert.equal(await turnstileOk(env, "x".repeat(2049), null), false);
    assert.equal(called, 0);
  });

  it("passes when siteverify succeeds", async () => {
    stubSiteverify({
      success: true,
      hostname: "barbart.ca",
      action: "inquiry",
    });
    assert.equal(
      await turnstileOk({ TURNSTILE_SECRET_KEY: "shh" }, "tok", "1.2.3.4"),
      true,
    );
  });

  it("fails when siteverify rejects", async () => {
    stubSiteverify({
      success: false,
      "error-codes": ["invalid-input-response"],
    });
    assert.equal(
      await turnstileOk({ TURNSTILE_SECRET_KEY: "shh" }, "bogus", null),
      false,
    );
  });

  it("fails closed on network errors", async () => {
    globalThis.fetch = () => Promise.reject(new Error("offline"));
    assert.equal(
      await turnstileOk({ TURNSTILE_SECRET_KEY: "shh" }, "tok", null),
      false,
    );
  });
});

describe("public forms with Turnstile on", async () => {
  const { onRequestPost: inquire } =
    await import("../../functions/api/inquiries.ts");
  const { onRequestPost: collect } =
    await import("../../functions/api/collectors.ts");
  const env = {
    TURNSTILE_SECRET_KEY: "shh",
    RESEND_API_KEY: "re_test",
    RESEND_SEGMENT_ID: "seg_123",
    ARTIST_INBOX: "studio@example.com",
  };
  const post = (handler, path, body) =>
    handler({
      request: new Request(`https://barbart.ca${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    });

  // 403, not 400: the page asks the visitor to finish the check, and the
  // offline outbox keeps a saved note instead of dropping it as bad input.
  it("answers a missing check with 403 and sends nothing", async () => {
    let sent = 0;
    globalThis.fetch = async () => {
      sent += 1;
      return { ok: true, json: async () => ({}) };
    };
    const inquiry = await post(inquire, "/api/inquiries", {
      paintingTitle: "First Thaw",
      name: "Ada",
      email: "ada@example.com",
    });
    assert.equal(inquiry.status, 403);
    const join = await post(collect, "/api/collectors", {
      email: "ada@example.com",
    });
    assert.equal(join.status, 403);
    const leave = await post(collect, "/api/collectors", {
      action: "unsubscribe",
      email: "ada@example.com",
    });
    assert.equal(leave.status, 403);
    assert.equal(sent, 0);
  });

  it("still rejects bad input with 400 once the check passes", async () => {
    globalThis.fetch = async () => ({ json: async () => ({ success: true }) });
    const res = await post(inquire, "/api/inquiries", {
      paintingTitle: "First Thaw",
      name: "Ada",
      email: "not-an-email",
      turnstileToken: "tok",
    });
    assert.equal(res.status, 400);
  });
});

describe("status hands out the site key", async () => {
  const { onRequestGet } = await import("../../functions/api/status.ts");
  const keyFor = async (env) =>
    (await (await onRequestGet({ env })).json()).turnstileSiteKey;

  it("only once the secret is set, so the widget never shows unchecked", async () => {
    assert.equal(await keyFor({ TURNSTILE_SITE_KEY: "0xSite" }), "");
    assert.equal(
      await keyFor({
        TURNSTILE_SITE_KEY: "0xSite",
        TURNSTILE_SECRET_KEY: "shh",
      }),
      "0xSite",
    );
  });
});
