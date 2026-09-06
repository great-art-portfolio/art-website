import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveDims, stemOf } from "../../src/lib/ar.ts";
import {
  buildMarkdown,
  paintingFilePaths,
  parsePainting,
  patchPainting,
} from "../../src/lib/painting-edit.ts";

describe("resolveDims", () => {
  it("uses the tape measurements when present", () => {
    assert.deepEqual(resolveDims(1943, 1967, 20, 20, 1.5), { w: 20, h: 20, d: 1.5 });
  });

  it("falls back to 24 in wide at the photo's aspect", () => {
    // 2000×1000 photo, no measurements → 24 wide, 12 tall, 1.5 deep.
    assert.deepEqual(resolveDims(2000, 1000, null, null, null), {
      w: 24,
      h: 12,
      d: 1.5,
    });
  });

  it("keeps a measured width and derives height from aspect", () => {
    assert.deepEqual(resolveDims(1000, 2000, 10, null, null), {
      w: 10,
      h: 20,
      d: 1.5,
    });
  });

  it("never divides by zero on a degenerate photo", () => {
    const dims = resolveDims(0, 0, null, null, null);
    assert.equal(Number.isFinite(dims.h), true);
  });
});

describe("stemOf", () => {
  it("strips the paintings folder and extension", () => {
    assert.equal(stemOf("src/content/paintings/1943x1967.md"), "1943x1967");
    assert.equal(stemOf("src/content/paintings/IMG_5667.md"), "IMG_5667");
  });
});

const SAMPLE = `---
title: "Night Reeds"
dateAdded: 2020-01-08
image: "2122x2118.jpg"
alt: "Moody teal abstract"
sold: false
price: 140.00
widthIn: 24
heightIn: 24
depthIn: 1.5
modelGlb: "/models/2122x2118.glb"
modelUsdz: "/models/2122x2118.usdz"
---
Rain over dark water.
`;

describe("parsePainting photo/model refs", () => {
  it("reads image and model refs", () => {
    const p = parsePainting(SAMPLE);
    assert.equal(p?.image, "2122x2118.jpg");
    assert.equal(p?.modelGlb, "/models/2122x2118.glb");
    assert.equal(p?.modelUsdz, "/models/2122x2118.usdz");
  });

  it("defaults to empty when absent", () => {
    const p = parsePainting("---\ntitle: \"X\"\n---\nBody.\n");
    assert.equal(p?.image, "");
    assert.equal(p?.modelGlb, "");
  });
});

describe("patchPainting model refs", () => {
  const edits = {
    title: "Night Reeds",
    price: "140.00",
    alt: "Moody teal abstract",
    description: "Rain over dark water.",
    widthIn: "24",
    heightIn: "24",
    depthIn: "24",
    medium: "",
    draft: false,
    sold: false,
  };

  it("leaves existing model refs untouched without overrides", () => {
    const next = patchPainting(SAMPLE, edits);
    assert.match(next, /modelGlb: "\/models\/2122x2118\.glb"/);
    assert.match(next, /modelUsdz: "\/models\/2122x2118\.usdz"/);
  });

  it("writes fresh refs after a rebuild", () => {
    const next = patchPainting(SAMPLE, {
      ...edits,
      modelGlb: "/models/night-reeds.glb",
      modelUsdz: "/models/night-reeds.usdz",
    });
    assert.match(next, /modelGlb: "\/models\/night-reeds\.glb"/);
  });

  it("adds missing model keys after a rebuild", () => {
    const bare = SAMPLE.replace(/modelGlb:.*\nmodelUsdz:.*\n/, "");
    const next = patchPainting(bare, {
      ...edits,
      modelGlb: "/models/x.glb",
      modelUsdz: "/models/x.usdz",
    });
    assert.match(next, /modelGlb: "\/models\/x\.glb"/);
  });

  it("updates dimensions like before", () => {
    const next = patchPainting(SAMPLE, { ...edits, widthIn: "30" });
    assert.match(next, /^widthIn: 30$/m);
  });

  it("writes the medium key when set", () => {
    const next = patchPainting(SAMPLE, { ...edits, medium: "Oil on canvas" });
    assert.match(next, /^medium: "Oil on canvas"$/m);
  });

  it("removes the medium key when emptied", () => {
    const withMedium = patchPainting(SAMPLE, { ...edits, medium: "Oil" });
    assert.match(withMedium, /^medium: "Oil"$/m);
    const next = patchPainting(withMedium, edits);
    assert.doesNotMatch(next, /^medium:/m);
  });

  it("flips the draft flag both ways", () => {
    assert.match(patchPainting(SAMPLE, { ...edits, draft: true }), /^draft: true$/m);
    const back = patchPainting(SAMPLE, { ...edits, draft: true });
    assert.match(patchPainting(back, edits), /^draft: false$/m);
  });

  it("reads medium and draft back", () => {
    const p = parsePainting(patchPainting(SAMPLE, { ...edits, medium: "Oil", draft: true }));
    assert.equal(p.medium, "Oil");
    assert.equal(p.draft, true);
    const plain = parsePainting(SAMPLE);
    assert.equal(plain.medium, "");
    assert.equal(plain.draft, false);
  });
});

describe("buildMarkdown", () => {
  const input = {
    title: "First Thaw",
    price: 125,
    alt: "Pale winter abstract",
    description: "Late snow.",
    imageFile: "first-thaw.jpg",
    widthIn: 24,
    heightIn: 36,
    depthIn: 1.5,
    medium: "Oil on canvas",
    draft: true,
    modelGlb: "",
    modelUsdz: "",
  };

  it("writes a complete draft file", () => {
    const md = buildMarkdown(input);
    assert.match(md, /^title: "First Thaw"$/m);
    assert.match(md, /^draft: true$/m);
    assert.match(md, /^medium: "Oil on canvas"$/m);
    assert.match(md, /^price: 125\.00$/m);
    const round = parsePainting(md);
    assert.equal(round.title, "First Thaw");
    assert.equal(round.draft, true);
    assert.equal(round.medium, "Oil on canvas");
    assert.equal(round.description, "Late snow.");
  });

  it("omits medium when blank, publishes when not a draft", () => {
    const md = buildMarkdown({ ...input, medium: "  ", draft: false });
    assert.doesNotMatch(md, /^medium:/m);
    assert.match(md, /^draft: false$/m);
  });
});

describe("paintingFilePaths", () => {
  const md = "src/content/paintings/first-thaw.md";
  const full = {
    image: "first-thaw.jpg",
    modelGlb: "/models/first-thaw.glb",
    modelUsdz: "/models/first-thaw.usdz",
  };
  it("removes md + photo + both models", () => {
    assert.deepEqual(paintingFilePaths(md, full), [
      md,
      "src/content/paintings/first-thaw.jpg",
      "public/models/first-thaw.glb",
      "public/models/first-thaw.usdz",
    ]);
  });
  it("skips missing photo and model-less paintings", () => {
    assert.deepEqual(paintingFilePaths(md, { image: "", modelGlb: "", modelUsdz: "" }), [md]);
  });
  it("ignores non-model refs", () => {
    assert.deepEqual(
      paintingFilePaths(md, { image: "x.jpg", modelGlb: "https://cdn.example/m.glb", modelUsdz: "" }),
      [md, "src/content/paintings/x.jpg"],
    );
  });
});
