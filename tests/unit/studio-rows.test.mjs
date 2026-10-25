import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchesSearch } from "../../src/lib/studio-rows.ts";

describe("matchesSearch", () => {
  it("finds every word anywhere, ignoring case and accents", () => {
    assert.equal(matchesSearch("Rivière Rouge", "riviere"), true);
    assert.equal(matchesSearch("Late Light on the Bow", "bow light"), true);
    assert.equal(matchesSearch("Late Light on the Bow", "bow river"), false);
  });

  it("matches everything when the box is empty", () => {
    assert.equal(matchesSearch("Thaw", "   "), true);
  });
});
