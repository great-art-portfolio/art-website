import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  priceBand,
  shapeOf,
  sizeBand,
  sizeRooms,
} from "../../src/lib/collection-filters.ts";

describe("collection filters", () => {
  it("bands sizes by the longer side", () => {
    assert.equal(sizeBand(6, 6), "small");
    assert.equal(sizeBand(12, 12), "small");
    assert.equal(sizeBand(16, 20), "medium");
    assert.equal(sizeBand(12, 36), "large");
    assert.equal(sizeBand(null, 12), null);
  });

  it("calls a square-ish photo square", () => {
    assert.equal(shapeOf(1), "square");
    assert.equal(shapeOf(0.95), "square");
    assert.equal(shapeOf(0.75), "tall");
    assert.equal(shapeOf(3), "wide");
  });

  it("bands prices the way buyers think", () => {
    assert.equal(priceBand(60), "under-200");
    assert.equal(priceBand(200), "200-500");
    assert.equal(priceBand(500), "200-500");
    assert.equal(priceBand(2400), "over-500");
  });

  it("splits rooms largest first, in order, skipping empty ones", () => {
    const items = [
      { t: "a", b: "small" },
      { t: "b", b: "large" },
      { t: "c", b: null },
      { t: "d", b: "small" },
    ];
    assert.deepEqual(
      sizeRooms(items, (i) => i.b).map((r) => [r.key, r.items.map((i) => i.t)]),
      [
        ["large", ["b"]],
        ["small", ["a", "d"]],
        ["other", ["c"]],
      ],
    );
  });
});
