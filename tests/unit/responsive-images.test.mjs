import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GALLERY_WIDTHS,
  PHOTO_WIDTHS,
  SOLD_WIDTHS,
  featuredSizes,
  gallerySizes,
  photoSizes,
  soldSizes,
} from "../../src/lib/responsive-images.ts";
import { MAX_SIDE, scaleFor } from "../../src/lib/image.ts";

describe("responsive-images contracts", () => {
  it("gallery widths stay ascending and phone-friendly", () => {
    assert.deepEqual(GALLERY_WIDTHS, [400, 700, 1000, 1400]);
  });

  it("sold widths are a subset of gallery widths", () => {
    assert.deepEqual(SOLD_WIDTHS, [400, 700]);
    for (const w of SOLD_WIDTHS) assert.ok(GALLERY_WIDTHS.includes(w));
  });

  it("photo widths cover phone through desktop", () => {
    assert.deepEqual(PHOTO_WIDTHS, [640, 960, 1280, 1600]);
  });

  it("each gallery card asks for its exact slot", () => {
    // Measured in a browser at 1280px: 7, 5 and 4-column cards are 693,
    // 483 and 379px wide.
    const widest = (s) =>
      Number(s.match(/^\(min-width: 1264px\) (\d+)px/)?.[1]);
    assert.equal(widest(gallerySizes("normal", 7)), 693);
    assert.equal(widest(gallerySizes("normal", 5)), 483);
    assert.equal(widest(gallerySizes("normal", 4)), 379);
    assert.equal(widest(gallerySizes("normal", 6)), 588);
    assert.equal(widest(gallerySizes("big", 8)), 797);
    assert.equal(widest(gallerySizes("big-wide", 12)), 1216);
    assert.equal(widest(soldSizes()), 384);
  });

  it("bigger tiles take the full width on tablets", () => {
    assert.match(
      gallerySizes("wide", 8),
      /\(min-width: 40rem\) calc\(100vw - 48px\)/,
    );
    assert.match(
      gallerySizes("normal", 4),
      /\(min-width: 40rem\) calc\(\(100vw - 88px\) \/ 2\)/,
    );
  });

  it("featured and photo sizes cap at the page width", () => {
    assert.equal(
      featuredSizes(),
      "(min-width: 76rem) 530px, (min-width: 60rem) 44vw, 92vw",
    );
    assert.equal(
      photoSizes(),
      "(min-width: 76rem) 600px, (min-width: 60rem) 55vw, (min-width: 38rem) 600px, 92vw",
    );
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
