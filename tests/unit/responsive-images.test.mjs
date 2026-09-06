import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GALLERY_WIDTHS,
  PHOTO_WIDTHS,
  SOLD_WIDTHS,
  gallerySizes,
  photoSizes,
  soldSizes,
} from "../../src/lib/responsive-images.ts";
import { MAX_SIDE, scaleFor } from "../../src/lib/image.ts";

describe("responsive-images contracts", () => {
  it("gallery widths stay ascending and phone-friendly", () => {
    assert.deepEqual(GALLERY_WIDTHS, [400, 700, 1000]);
  });

  it("sold widths are a subset of gallery widths", () => {
    assert.deepEqual(SOLD_WIDTHS, [400, 700]);
    for (const w of SOLD_WIDTHS) assert.ok(GALLERY_WIDTHS.includes(w));
  });

  it("photo widths cover phone through desktop", () => {
    assert.deepEqual(PHOTO_WIDTHS, [640, 960, 1280, 1600]);
  });

  it("sizes() match the CSS grid slots", () => {
    assert.equal(gallerySizes(), "(min-width: 60rem) 42vw, (min-width: 40rem) 44vw, 92vw");
    assert.equal(soldSizes(), "(min-width: 60rem) 22vw, (min-width: 40rem) 44vw, 92vw");
    assert.equal(photoSizes(), "(min-width: 48rem) 55vw, 92vw");
  });
});

describe("scaleFor (pure upload sizing)", () => {
  it("keeps small photos at natural size", () => {
    assert.deepEqual(scaleFor(1200, 800, 0), { width: 1200, height: 800 });
  });

  it("downscales the long side to MAX_SIDE", () => {
    assert.deepEqual(scaleFor(4000, 3000, 0), { width: 2000, height: 1500 });
    assert.equal(Math.max(...Object.values(scaleFor(3000, 4000, 0))), MAX_SIDE);
  });

  it("swaps dimensions on 90/270 rotation", () => {
    assert.deepEqual(scaleFor(1200, 800, 90), { width: 800, height: 1200 });
    assert.deepEqual(scaleFor(1200, 800, 270), { width: 800, height: 1200 });
    assert.deepEqual(scaleFor(1200, 800, 180), { width: 1200, height: 800 });
  });
});
