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
