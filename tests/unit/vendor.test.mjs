import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Vendored 3D bundles, rebuilt with `pnpm vendor`. The painting page and
 * admin flows load them from stable /js/* URLs so Vite doesn't prefetch
 * ~850KB of viewer code with the page. If this fails after changing
 * src/lib/ar.ts or upgrading three or model-viewer, rerun `pnpm vendor` and
 * commit the result.
 */
describe("vendored viewer + AR builder", () => {
  for (const file of ["public/js/model-viewer.js", "public/js/ar-tooling.js"]) {
    it(`${file} exists and is not a stub`, () => {
      const path = join(root, file);
      assert.ok(existsSync(path), `${file} built — run pnpm vendor`);
      assert.ok(
        statSync(path).size > 100_000,
        `${file} looks like a real bundle`,
      );
    });
  }

  it("ar-tooling.js carries the admin flow's entry points", () => {
    const bundle = readFileSync(join(root, "public/js/ar-tooling.js"), "utf8");
    for (const name of [
      "buildArModels",
      "estimateDims",
      "rebuildForDimFix",
      "rebuildArFiles",
    ]) {
      assert.ok(bundle.includes(name), `bundle exports ${name}`);
    }
  });

  it("bundles are self-contained (no bare imports for browsers to choke on)", () => {
    // The unbundled model-viewer module imports bare "three", which browsers
    // can't resolve without an import map, so the viewer would fail to load.
    // Bundles have to inline their dependencies (see scripts/vendor).
    for (const file of [
      "public/js/model-viewer.js",
      "public/js/ar-tooling.js",
    ]) {
      const bundle = readFileSync(join(root, file), "utf8");
      assert.ok(!bundle.includes('from"three"'), `${file} inlines three`);
      assert.ok(!bundle.includes("from'three'"), `${file} inlines three`);
    }
  });

  it("ar-tooling exposes the window.ArTooling global", () => {
    // IIFE build. Callers load it with a <script> tag, since Vite dev won't
    // import /public files as modules, and then use the global.
    const bundle = readFileSync(join(root, "public/js/ar-tooling.js"), "utf8");
    assert.ok(bundle.includes("ArTooling"), "bundle sets window.ArTooling");
  });
});
