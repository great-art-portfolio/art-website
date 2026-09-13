import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildShareCaption } from "../../src/lib/share-caption.ts";

describe("buildShareCaption", () => {
  it("writes the title, details, price, and page link", () => {
    assert.equal(
      buildShareCaption({
        title: "First Thaw",
        priceLabel: "$140.00 CAD",
        meta: "Oil on canvas · 24 × 36 in",
        slug: "first-thaw",
      }),
      "New in the gallery: “First Thaw” — Oil on canvas · 24 × 36 in — $140.00 CAD\nhttps://barbart.ca/paintings/first-thaw",
    );
  });

  it("skips the middle when the painting is bare", () => {
    assert.equal(
      buildShareCaption({
        title: "First Thaw",
        priceLabel: null,
        meta: "",
        slug: "first-thaw",
      }),
      "New in the gallery: “First Thaw”\nhttps://barbart.ca/paintings/first-thaw",
    );
  });

  it("falls back to Untitled and drops a missing link", () => {
    assert.equal(
      buildShareCaption({ title: "", priceLabel: null, meta: "", slug: "" }),
      "New in the gallery: “Untitled”",
    );
  });
});
