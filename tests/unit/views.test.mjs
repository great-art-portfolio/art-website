import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { viewsLabel } from "../../src/lib/views.ts";

describe("viewsLabel", () => {
  it("counts small numbers exactly, in words", () => {
    assert.equal(viewsLabel(0), "0 views");
    assert.equal(viewsLabel(1), "1 view");
    assert.equal(viewsLabel(2), "2 views");
    assert.equal(viewsLabel(333), "333 views");
    assert.equal(viewsLabel(999), "999 views");
  });

  it("compacts thousands to digits plus k", () => {
    assert.equal(viewsLabel(1000), "1k views");
    assert.equal(viewsLabel(1500), "1.5k views");
    assert.equal(viewsLabel(1234), "1.23k views");
    assert.equal(viewsLabel(12_345), "12.3k views");
    assert.equal(viewsLabel(333_000), "333k views");
    assert.equal(viewsLabel(999_999), "999k views");
  });

  it("compacts millions and up the same way", () => {
    assert.equal(viewsLabel(1_000_000), "1m views");
    assert.equal(viewsLabel(2_000_000), "2m views");
    assert.equal(viewsLabel(2_500_000), "2.5m views");
    assert.equal(viewsLabel(1_500_000_000), "1.5b views");
  });
});
