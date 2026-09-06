import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Vendored 3D bundles (rebuilt via `pnpm vendor`): the painting page and
 * the admin flows load these from stable /js/* URLs so Vite never
 * prefetches ~850KB of viewer/builder code with the page. If this test
 * fails after touching src/lib/ar.ts or upgrading three/model-viewer,
 * re-run `pnpm vendor` and commit the result.
 */
describe("vendored viewer + AR builder", () => {
  for (const file of ["public/js/model-viewer.js", "public/js/ar-tooling.js"]) {
    it(`${file} exists and is not a stub`, () => {
      const path = join(root, file);
      assert.ok(existsSync(path), `${file} built — run pnpm vendor`);
      assert.ok(statSync(path).size > 100_000, `${file} looks like a real bundle`);
    });
  }

  it("ar-tooling.js carries the admin flow's entry points", () => {
    const bundle = readFileSync(join(root, "public/js/ar-tooling.js"), "utf8");
    for (const name of ["buildArModels", "estimateDims", "rebuildForDimFix", "rebuildArFiles"]) {
      assert.ok(bundle.includes(name), `bundle exports ${name}`);
    }
  });

  it("bundles are self-contained (no bare imports for browsers to choke on)", () => {
    // The verbatim model-viewer module imports bare "three" — browsers
    // can't resolve that without an import map, so the viewer silently
    // never loads. Bundles must inline everything (see scripts/vendor).
    for (const file of ["public/js/model-viewer.js", "public/js/ar-tooling.js"]) {
      const bundle = readFileSync(join(root, file), "utf8");
      assert.ok(!bundle.includes('from"three"'), `${file} inlines three`);
      assert.ok(!bundle.includes("from'three'"), `${file} inlines three`);
    }
  });

  it("ar-tooling exposes the window.ArTooling global", () => {
    // IIFE build: callers load it with a <script> tag (Vite dev refuses
    // /public files as modules), then call through the global.
    const bundle = readFileSync(join(root, "public/js/ar-tooling.js"), "utf8");
    assert.ok(bundle.includes("ArTooling"), "bundle sets window.ArTooling");
  });
});
