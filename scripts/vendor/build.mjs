#!/usr/bin/env node
/**
 * Vendor heavy browser-only bundles into public/js/ (committed).
 *
 * Why: Vite prefetches every chunk reachable from a page module's
 * dynamic imports, and Astro 7 gives user config no way to turn that
 * off for the client build — so ~1MB of 3D viewer + model-building
 * code downloaded on pages whose visitors never touch those features.
 * Loading these stable URLs with plain <script> tags (see
 * src/lib/vendor-loader.ts) keeps them out of Vite's graph entirely:
 * strictly on-demand, no prefetch. Script tags — never native import() —
 * because Vite dev refuses to serve /public files as modules.
 *
 *   pnpm vendor
 *
 * Re-run after upgrading @google/model-viewer or three, or after
 * editing src/lib/ar.ts (ar-tooling.js bundles it), then commit
 * the result. Nothing else in the build depends on these files.
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

// esbuild bundles both outputs (viewer + AR builder) as self-contained ESM.
const esbuild = join(root, "node_modules", ".bin", "esbuild");

// 3D viewer: bundle the package's module build so `three` is inlined.
// (The verbatim model-viewer-module.min.js imports bare "three", which
// browsers can't resolve without an import map — shipping it raw 404s
// nothing but still never defines <model-viewer>.)
const mvPkg = join(dirname(require.resolve("@google/model-viewer/package.json")), "dist");
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

// AR builder (three.js + GLB/USDZ exporters): bunded from src so the
// upload flow, backfill, and dimension-fix regens share one implementation.
// IIFE + global (not ESM): callers load it with a plain <script> tag because
// Vite dev refuses to serve /public files as modules — native import() of a
// /js URL works in production but throws in `astro dev`.
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
