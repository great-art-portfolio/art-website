import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  compareGalleryOrder,
  groupByAvailability,
  isPublished,
  isTitleTaken,
  metaDescription,
  pageTitle,
  slugifyTitle,
} from "../../src/lib/site.ts";

describe("pageTitle", () => {
  it("is the page's own short name, without her name added", () => {
    assert.equal(pageTitle("Thank you"), "Thank you");
    assert.equal(pageTitle("Prairie Moon"), "Prairie Moon");
  });
});

describe("metaDescription", () => {
  it("uses the description as plain text", () => {
    assert.equal(
      metaDescription("Deep *teal* and\ngreen.", "alt"),
      "Deep teal and green.",
    );
  });
  it("falls back to the alt text", () => {
    assert.equal(metaDescription("  ", "A teal painting"), "A teal painting");
  });
  it("cuts long text at a sentence end", () => {
    const a =
      "Layers of deep teal and green crossed by fine pale lines, like rain.";
    const long = `${a} ${"More words follow here. ".repeat(8)}`;
    const out = metaDescription(long, "");
    assert.ok(out.length <= 160);
    assert.ok(out.endsWith("."));
    assert.ok(out.startsWith(a));
  });
  it("cuts at a word with an ellipsis when no sentence ends early", () => {
    const out = metaDescription("word ".repeat(60), "");
    assert.ok(out.length <= 161);
    assert.ok(out.endsWith("word…"));
  });
});

describe("isPublished", () => {
  it("treats missing or false draft as published", () => {
    assert.equal(isPublished({}), true);
    assert.equal(isPublished({ draft: false }), true);
  });

  it("hides drafts from buyers", () => {
    assert.equal(isPublished({ draft: true }), false);
  });

  it("hides trashed paintings from buyers", () => {
    assert.equal(isPublished({ trash: true }), false);
    assert.equal(isPublished({ draft: false, trash: true }), false);
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

describe("isTitleTaken", () => {
  const taken = ["Prairie Moon", "Night Reeds"];

  it("spots an exact duplicate", () => {
    assert.equal(isTitleTaken(taken, "Prairie Moon", null), true);
  });

  it("matches through case and punctuation", () => {
    assert.equal(isTitleTaken(taken, "prairie moon!", null), true);
    assert.equal(isTitleTaken(taken, "Night—Reeds", null), true);
  });

  it("lets an untouched title through", () => {
    assert.equal(isTitleTaken(taken, "First Thaw", null), false);
  });

  it("exempts the painting being renamed", () => {
    assert.equal(isTitleTaken(taken, "Prairie Moon", "prairie-moon"), false);
    assert.equal(isTitleTaken(taken, "Night Reeds", "prairie-moon"), true);
  });

  it("gives titles without plain letters their own links", () => {
    assert.equal(isTitleTaken(["!!!"], "???", null), false);
    assert.equal(isTitleTaken(["🌸"], "🌸", null), true);
  });
});

describe("slugifyTitle", () => {
  it("dashes plain titles", () => {
    assert.equal(slugifyTitle("Night Reeds"), "night-reeds");
    assert.equal(slugifyTitle("Café du Lac"), "cafe-du-lac");
  });

  it("never takes the old studio link addresses", () => {
    assert.equal(slugifyTitle("Create"), "create-painting");
    assert.equal(slugifyTitle("Edit"), "edit-painting");
  });

  it("gives letterless titles a stable, non-empty link", () => {
    const a = slugifyTitle("🌸");
    assert.match(a, /^painting-[0-9a-z]+$/);
    assert.equal(slugifyTitle("🌸"), a);
    assert.notEqual(slugifyTitle("夜"), a);
  });
});
