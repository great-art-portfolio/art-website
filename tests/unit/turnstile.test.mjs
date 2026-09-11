import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { turnstileOk } from "../../functions/_lib/turnstile.ts";

/** Backend siteverify shape: stub fetch, never hits Cloudflare.
 * Extensionless imports resolve via the test-only loader. */

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
    const form = init?.body;
    assert.ok(form instanceof FormData);
    assert.equal(form.get("secret"), "shh");
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
