import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  desktopSlots,
  galleryTiles,
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

describe("galleryTiles tall paintings", () => {
  it("keeps a tall narrow canvas normal, since its height is capped", () => {
    const tall = { aspect: 12 / 36, widthIn: 12, heightIn: 36 };
    assert.deepEqual(galleryTiles([square(12), square(12), tall]), [
      "normal",
      "normal",
      "normal",
    ]);
  });
});

describe("desktopSlots", () => {
  const spans = (items) => desktopSlots(items).map((s) => s.span);
  const rows = (items) => {
    // Sum spans into rows of 12 to prove nothing leaves a hole.
    const out = [];
    let sum = 0;
    for (const s of desktopSlots(items)) {
      sum += s.span;
      if (sum >= 12) {
        out.push(sum);
        sum = 0;
      }
    }
    if (sum > 0) out.push(sum);
    return out;
  };
  const wide = (w, h) => ({ aspect: w / h, widthIn: w, heightIn: h });

  it("repeats the stagger for paintings of one size", () => {
    const ten = Array.from({ length: 10 }, () => square(12));
    assert.deepEqual(spans(ten), [7, 5, 4, 4, 4, 5, 7, 4, 4, 4]);
    assert.deepEqual(
      desktopSlots(ten).map((s) => s.lift),
      [0, 2, 0, 1, 0, 2, 0, 1, 0, 0],
    );
  });

  it("fills a short last row the way the old pattern did", () => {
    const n = (count) => Array.from({ length: count }, () => square(12));
    assert.deepEqual(spans(n(3)), [7, 5, 6]);
    assert.equal(desktopSlots(n(3))[2]?.start, 4);
    assert.deepEqual(spans(n(4)), [7, 5, 6, 6]);
    assert.deepEqual(spans(n(9)), [7, 5, 4, 4, 4, 5, 7, 6, 6]);
    assert.deepEqual(
      desktopSlots(n(9)).map((s) => s.lift),
      [0, 2, 0, 1, 0, 2, 0, 1, 0],
    );
  });

  it("puts the next small painting beside a big one", () => {
    const items = [square(12), square(12), square(30), square(12), square(12)];
    assert.deepEqual(spans(items), [7, 5, 8, 4, 6]);
  });

  it("never leaves a hole when big and wide paintings bunch up", () => {
    const items = [
      square(12),
      wide(36, 12),
      wide(36, 12),
      wide(36, 12),
      square(6),
      square(40),
      wide(48, 24),
      square(12),
      square(12),
      square(12),
    ];
    for (const sum of rows(items).slice(0, -1)) assert.equal(sum, 12);
  });

  it("gives the larger of a pair the larger slot", () => {
    assert.deepEqual(spans([square(8), square(12), square(12)]), [5, 7, 6]);
    assert.deepEqual(spans([square(12), square(12)]), [7, 5]);
  });

  it("gives a big wide canvas the whole row", () => {
    assert.deepEqual(spans([square(12), square(12), wide(48, 24)]), [7, 5, 12]);
  });

  it("keeps the last card level", () => {
    assert.equal(desktopSlots([square(12), square(12)])[1]?.lift, 0);
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
