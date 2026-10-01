import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync, strFromU8 } from "fflate";

/**
 * Every committed USDZ must use a vertical (wall) plane anchor. A
 * floor-anchored model opens lying flat in Quick Look. This guards the
 * exporter options across three.js upgrades, whose option shape has changed
 * before.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dir = join(root, "public", "models");

describe("usdz wall anchoring", () => {
  const files = readdirSync(dir).filter((f) => f.endsWith(".usdz"));
  assert.ok(files.length > 0, "expected committed models");
  for (const file of files) {
    it(`${file} anchors to walls, not floors`, () => {
      const zip = unzipSync(readFileSync(join(dir, file)));
      const names = Object.keys(zip);
      const scene = names.find((n) => n.endsWith("model.usda"));
      assert.ok(scene, "usdz holds a scene description");
      const usda = strFromU8(zip[scene]);
      assert.match(
        usda,
        /preliminary:planeAnchoring:alignment = "vertical"/,
        "wall anchor present",
      );
      assert.doesNotMatch(
        usda,
        /planeAnchoring:alignment = "horizontal"/,
        "no floor anchor",
      );
    });
  }
});
