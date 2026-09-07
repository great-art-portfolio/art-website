import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCollectorEmail } from "../../functions/_lib/collectors.ts";

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
