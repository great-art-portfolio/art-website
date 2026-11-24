import { describe, it } from "node:test";
import assert from "node:assert/strict";
import jsQR from "jsqr";
import sharp from "sharp";
import { paintedQrSvg, paintingPageUrl, qrSvg } from "../../src/lib/qr.ts";

/** Reads a code the way a phone camera would: draws qrSvg's rectangles
 * to pixels at `px` square, on a `bg` grey surround, and decodes them. */
function scan(svg, px, bg = 255) {
  const full = Number(svg.match(/viewBox="0 0 (\d+)/)[1]);
  const dark = Array.from({ length: full }, () => new Array(full).fill(false));
  for (const m of svg.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    const [x, y, run] = [Number(m[1]), Number(m[2]), Number(m[3])];
    for (let i = 0; i < run; i++) dark[y][x + i] = true;
  }
  const pad = 20;
  const w = px + 2 * pad;
  const data = new Uint8ClampedArray(w * w * 4);
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++) {
      const qx = x - pad;
      const qy = y - pad;
      const inside = qx >= 0 && qy >= 0 && qx < px && qy < px;
      const v = !inside
        ? bg
        : dark[Math.floor((qy * full) / px)][Math.floor((qx * full) / px)]
          ? 0
          : 255;
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  return jsQR(data, w, w, { inversionAttempts: "dontInvert" })?.data ?? null;
}

/** Build-time QR codes use absolute buyer URLs and output embeddable SVG. */

describe("paintingPageUrl", () => {
  it("points at the live buyer page, never localhost", async () => {
    assert.equal(
      paintingPageUrl("night-reeds"),
      "https://barbart.ca/paintings/night-reeds",
    );
  });
  it("opens the page in the language it was shown in", () => {
    assert.equal(
      paintingPageUrl("night-reeds", "fr"),
      "https://barbart.ca/fr/paintings/night-reeds",
    );
    assert.equal(
      paintingPageUrl("night-reeds", "en"),
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

  it("draws a square with the standard four-module quiet zone", () => {
    // night-reeds' URL fits a 29-module code, so 37 with the margin.
    const svg = qrSvg(paintingPageUrl("night-reeds"));
    assert.match(svg, /viewBox="0 0 37 37"/);
    assert.match(
      qrSvg(paintingPageUrl("night-reeds"), 0),
      /viewBox="0 0 29 29"/,
    );
  });

  it("scans back to its URL, printed or on a dark page", () => {
    for (const url of [
      paintingPageUrl("night-reeds"),
      paintingPageUrl("endurance-under-pressure", "ja"),
      paintingPageUrl(
        "a-very-long-painting-title-about-the-prairie-in-winter-light",
      ),
    ]) {
      const svg = qrSvg(url);
      assert.equal(scan(svg, 240), url, "printed card");
      // The painting page shows it at 7rem (112 px) on its dark background.
      assert.equal(scan(svg, 112, 30), url, "112 px, dark page");
    }
  });

  it("renders deterministically for the same URL", () => {
    const url = paintingPageUrl("night-reeds");
    assert.equal(qrSvg(url), qrSvg(url));
  });
});

async function scanRasterSvg(svg, px, bg = "#ffffff") {
  const pad = 20;
  const { data, info } = await sharp(Buffer.from(svg))
    .resize(px, px, { kernel: sharp.kernel.lanczos3 })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: bg })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return (
    jsQR(new Uint8ClampedArray(data), info.width, info.height, {
      inversionAttempts: "dontInvert",
    })?.data ?? null
  );
}

describe("paintedQrSvg", () => {
  it("renders deterministically with zero id attributes and Barbara palette colors", () => {
    const url = paintingPageUrl("night-reeds");
    const svg = paintedQrSvg(url);
    assert.ok(svg.startsWith("<svg"));
    assert.ok(svg.includes("</svg>"));
    assert.equal(/\sid=/i.test(svg), false);
    assert.ok(svg.includes("#f5f0e5"));
    assert.ok(svg.includes("#171d23"));
    assert.equal(svg, paintedQrSvg(url));
  });

  it("scans cleanly when rasterized for print cards and desktop dark AR boxes", async () => {
    for (const url of [
      paintingPageUrl("night-reeds"),
      paintingPageUrl("endurance-under-pressure", "ja"),
      paintingPageUrl(
        "a-very-long-painting-title-about-the-prairie-in-winter-light",
      ),
      "https://www.instagram.com/barbara.straka.fine.art.yyc/",
    ]) {
      const svg = paintedQrSvg(url);
      assert.equal(await scanRasterSvg(svg, 240, "#ffffff"), url, "240px");
      assert.equal(
        await scanRasterSvg(svg, 112, "#171512"),
        url,
        "112px dark page",
      );
    }
  });
});
