import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { paintingPageUrl, qrSvg } from "../../src/lib/qr.ts";

/** Build-time QR codes use absolute buyer URLs and output embeddable SVG. */

describe("paintingPageUrl", () => {
  it("points at the live buyer page, never localhost", async () => {
    assert.equal(
      paintingPageUrl("night-reeds"),
      "https://barbart.ca/paintings/night-reeds",
    );
  });
});

describe("qrSvg", () => {
  it("renders an embeddable SVG for the URL", () => {
    const svg = qrSvg(paintingPageUrl("night-reeds"));
    assert.ok(svg.startsWith("<svg"));
    assert.ok(svg.includes("</svg>"));
  });

  it("draws a square with a two-module quiet zone by default", () => {
    // night-reeds' URL fits a 29-module code, so 33 with the margin.
    const svg = qrSvg(paintingPageUrl("night-reeds"));
    assert.match(svg, /viewBox="0 0 33 33"/);
    assert.match(
      qrSvg(paintingPageUrl("night-reeds"), 0),
      /viewBox="0 0 29 29"/,
    );
  });

  it("renders deterministically for the same URL", () => {
    const url = paintingPageUrl("night-reeds");
    assert.equal(qrSvg(url), qrSvg(url));
  });
});
