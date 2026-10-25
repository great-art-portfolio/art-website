import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { keyWarning } from "../../src/lib/key-expiry.ts";

describe("keyWarning", () => {
  it("stays quiet while the key's last day is far off", () => {
    assert.equal(keyWarning("2026-12-31", "2026-10-25"), "");
    assert.equal(keyWarning(null, "2026-10-25"), "");
  });
  it("warns three weeks ahead, naming the day", () => {
    assert.equal(
      keyWarning("2026-11-10", "2026-10-25"),
      "Heads up: saving stops on November 10, when the site's GitHub key runs out. Ask Chris to renew it before then.",
    );
  });
  it("says saving stopped once the day has come", () => {
    assert.match(
      keyWarning("2026-10-25", "2026-10-25"),
      /^Saving stopped on October 25/,
    );
  });
});
