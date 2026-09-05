import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveDims, stemOf } from "../../src/lib/ar.ts";
import {
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
});
