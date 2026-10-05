import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  galleryTiles,
  leadSentence,
  pickFeatured,
} from "../../src/lib/gallery-layout.ts";

const square = (inches) => ({ aspect: 1, widthIn: inches, heightIn: inches });

describe("galleryTiles", () => {
  it("keeps a collection of one size even", () => {
    assert.deepEqual(galleryTiles([square(12), square(12), square(12)]), [
      "normal",
      "normal",
      "normal",
    ]);
  });

  it("gives a painting much larger than the rest a big tile", () => {
    assert.deepEqual(galleryTiles([square(12), square(30), square(12)]), [
      "normal",
      "big",
      "normal",
    ]);
  });

  it("follows her typical size instead of a fixed cutoff", () => {
    // Once 24 in squares are the norm, they are normal and only a much
    // larger canvas stands out.
    assert.deepEqual(
      galleryTiles([square(24), square(24), square(24), square(48)]),
      ["normal", "normal", "normal", "big"],
    );
  });

  it("treats the smaller of two paintings as typical", () => {
    assert.deepEqual(galleryTiles([square(12), square(30)]), ["normal", "big"]);
  });

  it("spans wide photos across two columns, wider still when big", () => {
    const wide = (w, h) => ({ aspect: w / h, widthIn: w, heightIn: h });
    assert.deepEqual(
      galleryTiles([square(12), square(12), wide(24, 12), wide(48, 24)]),
      ["normal", "normal", "wide", "big-wide"],
    );
  });

  it("leaves unmeasured paintings normal and out of the typical size", () => {
    const unmeasured = { aspect: 1, widthIn: null, heightIn: null };
    assert.deepEqual(galleryTiles([unmeasured, square(12), square(30)]), [
      "normal",
      "normal",
      "big",
    ]);
    assert.deepEqual(galleryTiles([unmeasured, unmeasured]), [
      "normal",
      "normal",
    ]);
  });
});

describe("pickFeatured", () => {
  const on = (iso) => ({ dateAdded: new Date(iso) });

  it("picks the most recently added painting", () => {
    assert.equal(
      pickFeatured([on("2020-01-01"), on("2026-09-05"), on("2024-03-01")]),
      1,
    );
  });

  it("keeps gallery order on a tie", () => {
    assert.equal(pickFeatured([on("2026-01-01"), on("2026-01-01")]), 0);
  });

  it("returns -1 when there is nothing to feature", () => {
    assert.equal(pickFeatured([]), -1);
  });
});

describe("leadSentence", () => {
  it("takes the first sentence", () => {
    assert.equal(
      leadSentence("A pale moon hangs over rock. Warm and grounded."),
      "A pale moon hangs over rock.",
    );
  });

  it("drops markdown emphasis and joins wrapped lines", () => {
    assert.equal(
      leadSentence("Soft *white* shapes\ndrift across the canvas. More."),
      "Soft white shapes drift across the canvas.",
    );
  });

  it("uses a description with no sentence break whole", () => {
    assert.equal(leadSentence("  Quiet and calm  "), "Quiet and calm");
  });
});
