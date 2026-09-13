import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sharePaintingPage, shareText } from "../../src/lib/page-share.ts";

describe("shareText", () => {
  it("names the painting with its buyer price", () => {
    assert.equal(shareText("First Thaw", 12500), "“First Thaw” — $125.00 CAD");
  });

  it("stays bare while priceless, never empty-titled", () => {
    assert.equal(shareText("First Thaw", 0), "“First Thaw”");
    assert.equal(shareText("", 0), "this painting");
  });
});

describe("sharePaintingPage", () => {
  it("fails honestly with no Web Share API around", async () => {
    assert.equal(
      await sharePaintingPage({
        title: "First Thaw",
        priceCents: 12500,
        url: "https://barbart.ca/paintings/first-thaw",
      }),
      "failed",
    );
  });
});
