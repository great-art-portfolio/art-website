import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  __resetTurnstileCache,
  extractSiteKey,
  getTurnstileSiteKey,
} from "../../src/lib/turnstile-widget.ts";

describe("extractSiteKey", () => {
  it("picks the key out of /api/status JSON", () => {
    assert.equal(extractSiteKey({ turnstileSiteKey: "pk-123" }), "pk-123");
  });

  it("is empty when the key is missing or not a string", () => {
    assert.equal(extractSiteKey(null), "");
    assert.equal(extractSiteKey({}), "");
    assert.equal(extractSiteKey({ turnstileSiteKey: 42 }), "");
    assert.equal(extractSiteKey({ turnstileSiteKey: "" }), "");
  });
});

describe("getTurnstileSiteKey", () => {
  it("fetches once and returns empty when the backend is down", async () => {
    __resetTurnstileCache();
    const original = globalThis.fetch;
    globalThis.fetch = () => Promise.reject(new Error("offline"));
    try {
      assert.equal(await getTurnstileSiteKey(), "");
    } finally {
      globalThis.fetch = original;
      __resetTurnstileCache();
    }
  });
});
