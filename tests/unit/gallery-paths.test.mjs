import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GALLERY_PATH,
  PAINTING_FILE,
  PHOTO_FILE,
} from "../../functions/_lib/gallery-paths.ts";

describe("gallery path guards", () => {
  it("lets Finder-style spaced names through", () => {
    const md = "src/content/paintings/1 copy 2.md";
    assert.equal(PAINTING_FILE.test(md), true);
    assert.equal(GALLERY_PATH.test(md), true);
    assert.equal(PHOTO_FILE.test("src/content/paintings/1 copy 2.jpg"), true);
  });

  it("keeps ordinary studio names working", () => {
    assert.equal(
      PAINTING_FILE.test("src/content/paintings/prairie-moon.md"),
      true,
    );
    assert.equal(GALLERY_PATH.test("src/content/announcement.txt"), true);
  });

  it("still refuses escapes and wrong folders", () => {
    for (const bad of [
      "src/content/paintings/../.env",
      "src/content/paintings/evil.mjs",
      "public/models/x.glb",
      "src/content/paintings/ leading-space.md",
    ]) {
      assert.equal(PAINTING_FILE.test(bad), false, bad);
    }
    assert.equal(GALLERY_PATH.test("src/content/paintings/../.env"), false);
    assert.equal(GALLERY_PATH.test("wrangler.toml"), false);
    assert.equal(PHOTO_FILE.test("src/content/paintings/x.svg"), false);
  });
});

describe("what the studio may write", () => {
  it("allows only painting files, photos, models and the site's text", () => {
    for (const ok of [
      "src/content/paintings/prairie-moon.md",
      "src/content/paintings/prairie-moon.JPG",
      "src/content/paintings/x.heic",
      "public/models/prairie-moon.glb",
      "public/models/prairie-moon.usdz",
      "src/content/translations/img_5667.json",
    ])
      assert.equal(GALLERY_PATH.test(ok), true, ok);
    // Nothing that could become a page or a script on the site.
    for (const bad of [
      "public/models/x.html",
      "public/models/x.js",
      "public/models/x.svg",
      "src/content/paintings/x.astro",
      "src/content/paintings/x.svg",
      "src/content/paintings/x.ts",
    ])
      assert.equal(GALLERY_PATH.test(bad), false, bad);
  });
});
