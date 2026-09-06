import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { groupByAvailability, isPublished } from "../../src/lib/site.ts";

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
