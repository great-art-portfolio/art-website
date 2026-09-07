import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  compareGalleryOrder,
  groupByAvailability,
  isPublished,
} from "../../src/lib/site.ts";

describe("isPublished", () => {
  it("treats missing or false draft as published", () => {
    assert.equal(isPublished({}), true);
    assert.equal(isPublished({ draft: false }), true);
  });

  it("hides drafts from buyers", () => {
    assert.equal(isPublished({ draft: true }), false);
  });
});

describe("groupByAvailability", () => {
  it("puts available first, sold after, keeping order", () => {
    const rows = [
      { title: "B", sold: true },
      { title: "A", sold: false },
      { title: "C", sold: false },
      { title: "D", sold: true },
    ];
    assert.deepEqual(groupByAvailability(rows), {
      available: [
        { title: "A", sold: false },
        { title: "C", sold: false },
      ],
      sold: [
        { title: "B", sold: true },
        { title: "D", sold: true },
      ],
    });
  });

  it("empty in, empty out", () => {
    assert.deepEqual(groupByAvailability([]), { available: [], sold: [] });
  });
});

describe("compareGalleryOrder", () => {
  const byOrder = (rows) => [...rows].sort(compareGalleryOrder);

  it("ordered works come first by number", () => {
    assert.deepEqual(
      byOrder([
        { title: "B", order: 2 },
        { title: "A", order: 0 },
        { title: "C", order: 1 },
      ]).map((r) => r.title),
      ["A", "C", "B"],
    );
  });

  it("unordered works trail alphabetically", () => {
    assert.deepEqual(
      byOrder([
        { title: "B", order: null },
        { title: "A" },
        { title: "C", order: 0 },
      ]).map((r) => r.title),
      ["C", "A", "B"],
    );
  });

  it("ties on the same number fall back to title", () => {
    assert.deepEqual(
      byOrder([
        { title: "B", order: 0 },
        { title: "A", order: 0 },
      ]).map((r) => r.title),
      ["A", "B"],
    );
  });
});
