import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseBakedCollection,
  parseBannerPreview,
  parseJsonWith,
  parsePracticeOverlay,
  parseStatsSeed,
} from "../../src/lib/schemas.ts";
import { z } from "zod";

const row = {
  slug: "night-reeds",
  title: "Night Reeds",
  price: 250,
  sold: false,
  alt: "Reeds at night",
  description: "Fresh from the studio.",
  widthIn: 24,
  heightIn: null,
  depthIn: 1.5,
  draft: false,
  publishOn: "",
  trash: false,
  trashedAt: "",
  image: "/img.jpg",
  order: null,
  mdPath: "src/content/paintings/night-reeds.md",
  views: 0,
};

describe("parseBakedCollection", () => {
  it("accepts the shape admin.astro bakes", () => {
    const rows = parseBakedCollection(JSON.stringify([row]));
    assert.equal(rows?.length, 1);
    assert.equal(rows?.[0]?.slug, "night-reeds");
  });

  it("drops bad rows instead of blanking the list", () => {
    const rows = parseBakedCollection(JSON.stringify([{ nope: true }, row]));
    assert.equal(rows?.length, 1);
  });

  it("reads a non-list as absent", () => {
    assert.equal(parseBakedCollection(JSON.stringify({})), null);
    assert.equal(parseBakedCollection("nope"), null);
  });
});

describe("parseStatsSeed", () => {
  const seed = {
    slug: "first-thaw",
    title: "First Thaw",
    sold: false,
    draft: false,
    image: "/img.jpg",
  };

  it("accepts the shape views.astro bakes", () => {
    const rows = parseStatsSeed(JSON.stringify([seed]));
    assert.equal(rows?.length, 1);
    assert.equal(rows?.[0]?.title, "First Thaw");
  });

  it("drops bad rows instead of blanking the table", () => {
    const rows = parseStatsSeed(JSON.stringify([{ nope: true }, seed]));
    assert.equal(rows?.length, 1);
  });

  it("reads a non-list as absent", () => {
    assert.equal(parseStatsSeed(JSON.stringify({})), null);
    assert.equal(parseStatsSeed("nope"), null);
  });
});

describe("parsePracticeOverlay", () => {
  it("accepts a practiced painting", () => {
    const overlay = parsePracticeOverlay({
      upserts: {
        a: {
          slug: "a",
          title: "A",
          price: 10,
          sold: false,
          alt: "",
          description: "",
          widthIn: "",
          heightIn: "",
          depthIn: "",
          medium: "",
          draft: true,
        },
      },
      deletes: ["b"],
    });
    assert.deepEqual(overlay?.deletes, ["b"]);
    // Older overlays carry no schedule — it reads as none, not garbage.
    assert.equal(overlay?.upserts["a"]?.publishOn, "");
  });

  it("resets garbage to absent", () => {
    assert.equal(parsePracticeOverlay(null), null);
    assert.equal(parsePracticeOverlay({ upserts: { a: { slug: 1 } } }), null);
  });
});

describe("parseBannerPreview", () => {
  it("accepts text with no expiry", () => {
    assert.deepEqual(parseBannerPreview({ text: "Hi", expires: null }), {
      text: "Hi",
      expires: null,
    });
  });

  it("rejects empty text", () => {
    assert.equal(parseBannerPreview({ text: "" }), null);
    assert.equal(parseBannerPreview({}), null);
  });
});

describe("parseJsonWith", () => {
  it("validates against the given schema", () => {
    const schema = z.object({ a: z.string() });
    assert.deepEqual(parseJsonWith('{"a":"b"}', schema), { a: "b" });
    assert.equal(parseJsonWith('{"a":1}', schema), null);
    assert.equal(parseJsonWith("nope", schema), null);
  });
});
