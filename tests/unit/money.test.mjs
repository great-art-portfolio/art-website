import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dollarsToCents, formatCAD } from "../../src/lib/money.ts";

describe("formatCAD", () => {
  it("formats integer cents as Canadian dollars", () => {
    assert.equal(formatCAD(14000), "$140.00");
    assert.equal(formatCAD(1), "$0.01");
    assert.equal(formatCAD(1999), "$19.99");
  });
});

describe("dollarsToCents", () => {
  it("converts dollars to integer cents", () => {
    assert.equal(dollarsToCents(140), 14000);
    assert.equal(dollarsToCents(19.99), 1999);
  });

  it("rejects zero, negative, and non-finite prices", () => {
    assert.equal(dollarsToCents(0), null);
    assert.equal(dollarsToCents(-5), null);
    assert.equal(dollarsToCents(NaN), null);
    assert.equal(dollarsToCents(Infinity), null);
  });
});
