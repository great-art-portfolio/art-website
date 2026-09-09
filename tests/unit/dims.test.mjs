import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatDimensions } from "../../src/lib/dims.ts";

describe("formatDimensions", () => {
  it("puts one unit at the end", () => {
    assert.equal(formatDimensions(24, 36, null), "24 × 36 in");
    assert.equal(formatDimensions(24, 36, 1.5), "24 × 36 × 1.5 in");
  });

  it("trims fractional inches to one decimal", () => {
    assert.equal(formatDimensions(24.25, 36, null), "24.3 × 36 in");
  });

  it("returns empty until width and height are measured", () => {
    assert.equal(formatDimensions(null, 36, null), "");
    assert.equal(formatDimensions(24, null, null), "");
    assert.equal(formatDimensions(null, null, null), "");
  });
});
