import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { errorMessage } from "../../src/lib/errors.ts";

describe("errorMessage", () => {
  it("reads an Error's message", () => {
    assert.equal(errorMessage(new Error("Nope")), "Nope");
  });

  it("passes a thrown string through", () => {
    assert.equal(errorMessage("plain words"), "plain words");
  });

  it("falls back when there is nothing to say", () => {
    assert.equal(errorMessage(new Error("")), "Something went wrong.");
    assert.equal(errorMessage(""), "Something went wrong.");
    assert.equal(errorMessage(null), "Something went wrong.");
    assert.equal(errorMessage(undefined), "Something went wrong.");
    assert.equal(errorMessage(500), "Something went wrong.");
  });
});
