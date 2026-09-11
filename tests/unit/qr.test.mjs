import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { paintingPageUrl, qrSvg } from "../../src/lib/qr.ts";

/** Build-time QR shapes: absolute buyer URLs, embeddable SVG output. */

describe("paintingPageUrl", () => {
  it("points at the live buyer page, never localhost", async () => {
    assert.equal(
      paintingPageUrl("night-reeds"),
      "https://barbart.ca/paintings/night-reeds",
    );
  });
});

describe("qrSvg", () => {
  it("renders an embeddable SVG for the URL", async () => {
    const svg = await qrSvg(paintingPageUrl("night-reeds"));
    assert.ok(svg.startsWith("<svg"));
    assert.ok(svg.includes("</svg>"));
  });

  it("renders deterministically for the same URL", async () => {
    const url = paintingPageUrl("night-reeds");
    assert.equal(await qrSvg(url), await qrSvg(url));
  });
});
