#!/usr/bin/env node
/**
 * Bundles heavy browser-only code into public/js/, which is committed.
 *
 * Vite prefetches every chunk reachable from a page's dynamic imports, and
 * Astro 7 has no config option to disable that for the client build. That
 * meant about 1MB of 3D viewer and model-building code downloaded on every
 * page. Loading these files with plain <script> tags (see
 * src/lib/vendor-loader.ts) keeps them out of Vite's graph so they load
 * only on demand. Script tags are used because Vite dev won't serve
 * /public files as modules.
 *
 *   pnpm vendor
 *
 * Re-run after upgrading @google/model-viewer or three, or after editing
 * src/lib/ar.ts (bundled into ar-tooling.js), then commit the result.
 */
import { mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const require = createRequire(join(root, "package.json"));
const outDir = join(root, "public", "js");
mkdirSync(outDir, { recursive: true });

// esbuild bundles both outputs as self-contained files.
const esbuild = join(root, "node_modules", ".bin", "esbuild");

// 3D viewer. Bundle the package's module build so `three` is inlined. The
// prebuilt model-viewer-module.min.js imports bare "three", which browsers
// can't resolve without an import map, so <model-viewer> would never be
// defined.
const mvPkg = join(
  dirname(require.resolve("@google/model-viewer/package.json")),
  "dist",
);
const mvSrc = join(mvPkg, "model-viewer-module.min.js");
if (!existsSync(mvSrc)) throw new Error(`model-viewer dist missing: ${mvSrc}`);
execFileSync(
  esbuild,
  [
    mvSrc,
    "--bundle",
    "--minify",
    "--format=esm",
    `--outfile=${join(outDir, "model-viewer.js")}`,
    "--log-level=error",
  ],
  { stdio: "inherit" },
);

// AR builder (three.js plus the GLB/USDZ exporters), bundled from src so
// uploads, the backfill, and dimension-change rebuilds share one
// implementation. Built as an IIFE with a global because it's loaded with
// a <script> tag. Native import() of a /js URL works in production but
// fails under `astro dev`.
execFileSync(
  esbuild,
  [
    join(here, "ar-entry.ts"),
    "--bundle",
    "--minify",
    "--format=iife",
    "--global-name=ArTooling",
    `--outfile=${join(outDir, "ar-tooling.js")}`,
    "--log-level=error",
  ],
  { stdio: "inherit" },
);

console.log("vendored public/js/model-viewer.js + public/js/ar-tooling.js");
