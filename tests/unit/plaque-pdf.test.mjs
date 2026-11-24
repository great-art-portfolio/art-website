import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildJpegPdf,
  normalizeInstagramHandle,
} from "../../src/lib/plaque-pdf.ts";

describe("normalizeInstagramHandle", () => {
  it("returns empty for blank input", () => {
    assert.equal(normalizeInstagramHandle(""), "");
    assert.equal(normalizeInstagramHandle("   @@@  "), "");
  });

  it("adds one leading @ and keeps valid handle characters", () => {
    assert.equal(normalizeInstagramHandle("barbarastraka"), "@barbarastraka");
    assert.equal(normalizeInstagramHandle("@barbarastraka"), "@barbarastraka");
    assert.equal(
      normalizeInstagramHandle("@@barbara.straka"),
      "@barbara.straka",
    );
  });

  it("extracts the handle from a pasted instagram.com URL", () => {
    assert.equal(
      normalizeInstagramHandle("https://www.instagram.com/barbara_art/?hl=en"),
      "@barbara_art",
    );
    assert.equal(
      normalizeInstagramHandle("instagram.com/straka.paintings/"),
      "@straka.paintings",
    );
  });
});

describe("buildJpegPdf", () => {
  it("wraps JPEG bytes in a valid single-page 5x7 in PDF with exact xref offsets", () => {
    const fakeJpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9,
    ]);
    const pdf = buildJpegPdf(fakeJpeg, 1500, 2100, 360, 504);
    const text = Buffer.from(pdf).toString("latin1");

    assert.ok(text.startsWith("%PDF-1.4\n"));
    assert.ok(text.includes("/MediaBox [0 0 360 504]"));
    assert.ok(text.includes("/Width 1500 /Height 2100"));
    assert.ok(text.includes("/Filter /DCTDecode /Length 8"));
    assert.ok(text.endsWith("%%EOF\n"));

    // Verify startxref and every object offset in the xref table matches byte indices.
    const startMatch = text.match(/startxref\n(\d+)\n%%EOF\n$/);
    assert.ok(startMatch !== null);
    const xrefOffset = Number(startMatch[1]);
    assert.equal(text.slice(xrefOffset, xrefOffset + 4), "xref");

    const entryMatches = [...text.matchAll(/(\d{10}) 00000 n \n/g)];
    assert.equal(entryMatches.length, 5);
    entryMatches.forEach((m, idx) => {
      const off = Number(m[1]);
      const expectedPrefix = `${idx + 1} 0 obj\n`;
      assert.equal(
        text.slice(off, off + expectedPrefix.length),
        expectedPrefix,
      );
    });
  });
});
