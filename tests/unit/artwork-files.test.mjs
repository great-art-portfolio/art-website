import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Artwork filenames must be lowercase. Rooms built from a lowercased id write
 * lowercased model refs, so an uppercase file 404s on case-sensitive servers.
 * New uploads are already lowercase; this also covers older files.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function lowerFiles(dir, exts) {
  return readdirSync(dir).filter((f) => exts.some((ext) => f.endsWith(ext)));
}

describe("artwork filenames are lowercase", () => {
  for (const [dir, exts] of [
    [join(root, "src", "content", "paintings"), [".md", ".jpg"]],
    [join(root, "public", "models"), [".glb", ".usdz"]],
  ]) {
    for (const file of lowerFiles(dir, exts)) {
      it(`${file} is lowercase`, () => {
        assert.equal(file, file.toLowerCase());
      });
    }
  }
});

describe("painting refs resolve to committed files", () => {
  const paintings = lowerFiles(join(root, "src", "content", "paintings"), [
    ".md",
  ]);
  assert.ok(paintings.length > 0, "expected committed paintings");
  for (const file of paintings) {
    it(`${file} image and models exist`, () => {
      const raw = readFileSync(
        join(root, "src", "content", "paintings", file),
        "utf8",
      );
      const value = (key) => {
        const m = raw.match(new RegExp(`^${key}:\\s*"?([^"\\n]+)"?`, "m"));
        return m === null ? "" : m[1].trim();
      };
      const image = value("image");
      assert.ok(image !== "", "has a photo");
      assert.ok(
        readdirSync(join(root, "src", "content", "paintings")).includes(image),
        `photo ${image} committed with exact case`,
      );
      for (const key of ["modelGlb", "modelUsdz"]) {
        const ref = value(key);
        if (ref === "") continue;
        const name = ref.split("/").pop() ?? "";
        assert.ok(
          readdirSync(join(root, "public", "models")).includes(name),
          `${key} ${name} committed with exact case`,
        );
      }
    });
  }
});
