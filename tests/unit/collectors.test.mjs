import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CONFIRM_TTL_MS,
  issueLinkToken,
  parseCollectorEmail,
  verifyLinkToken,
} from "../../functions/_lib/collectors.ts";

const env = { RESEND_API_KEY: "re_test" };

describe("parseCollectorEmail", () => {
  it("accepts a plain address", () => {
    assert.equal(parseCollectorEmail("fan@example.com"), "fan@example.com");
  });

  it("trims whitespace and lowercases", () => {
    assert.equal(
      parseCollectorEmail("  Fan@Example.COM \n"),
      "fan@example.com",
    );
  });

  it("rejects shapes that aren't an address", () => {
    for (const bad of [
      "",
      "   ",
      "not-an-email",
      "missing@tld",
      "@no-local.com",
      "two@@signs.com",
      "space in@addr.com",
    ]) {
      assert.equal(parseCollectorEmail(bad), null, JSON.stringify(bad));
    }
  });

  it("rejects non-strings and over-long input", () => {
    assert.equal(parseCollectorEmail(null), null);
    assert.equal(parseCollectorEmail(undefined), null);
    assert.equal(parseCollectorEmail(42), null);
    assert.equal(parseCollectorEmail({ email: "a@b.com" }), null);
    assert.equal(parseCollectorEmail(`a@${"b".repeat(250)}.com`), null);
  });
});

describe("link tokens", () => {
  it("round-trips a confirmation", async () => {
    const token = await issueLinkToken(env, "fan@example.com", "confirm");
    assert.ok(token);
    assert.equal(
      await verifyLinkToken(
        env,
        "fan@example.com",
        token,
        "confirm",
        CONFIRM_TTL_MS,
      ),
      "fan@example.com",
    );
  });

  it("round-trips a goodbye with no expiry", async () => {
    const old = await issueLinkToken(
      env,
      "fan@example.com",
      "goodbye",
      Date.now() - 365 * 24 * 60 * 60 * 1000,
    );
    assert.ok(old);
    assert.equal(
      await verifyLinkToken(env, "fan@example.com", old, "goodbye", null),
      "fan@example.com",
    );
  });

  it("rejects expired confirmations", async () => {
    const old = await issueLinkToken(
      env,
      "fan@example.com",
      "confirm",
      Date.now() - CONFIRM_TTL_MS - 1000,
    );
    assert.ok(old);
    assert.equal(
      await verifyLinkToken(
        env,
        "fan@example.com",
        old,
        "confirm",
        CONFIRM_TTL_MS,
      ),
      null,
    );
  });

  it("rejects tampered tokens, wrong addresses, and wrong purposes", async () => {
    const token = await issueLinkToken(env, "fan@example.com", "confirm");
    assert.ok(token);
    assert.equal(
      await verifyLinkToken(
        env,
        "fan@example.com",
        `${token}x`,
        "confirm",
        CONFIRM_TTL_MS,
      ),
      null,
    );
    assert.equal(
      await verifyLinkToken(
        env,
        "other@example.com",
        token,
        "confirm",
        CONFIRM_TTL_MS,
      ),
      null,
    );
    assert.equal(
      await verifyLinkToken(env, "fan@example.com", token, "goodbye", null),
      null,
    );
    assert.equal(
      await verifyLinkToken(env, "fan@example.com", "garbage", "confirm", null),
      null,
    );
  });

  it("stays quiet without a key", async () => {
    assert.equal(await issueLinkToken({}, "fan@example.com", "confirm"), null);
    assert.equal(
      await verifyLinkToken({}, "fan@example.com", "whatever", "confirm", null),
      null,
    );
  });
});
