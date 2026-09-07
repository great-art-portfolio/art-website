/**
 * On-demand loader for the vendored 3D bundles (public/js, via
 * `pnpm vendor`). Plain <script> tags — never native import() — because
 * Vite dev refuses to serve /public files as modules (works in the
 * production build, throws in `astro dev`). Stable URLs keep ~1.4MB of
 * viewer + builder out of Vite's graph: no prefetch, strictly on demand.
 */
import type { ArModels, DimFixResult } from "./ar";
import type { PaintingEdits, ParsedPainting } from "./painting-edit";

export const MODEL_VIEWER_URL = "/js/model-viewer.js";
export const AR_TOOLING_URL = "/js/ar-tooling.js";

/** The ar-tooling entry points the admin flows actually call. */
export interface ArTooling {
  buildArModels(
    img: HTMLImageElement,
    widthIn: number,
    heightIn: number,
    depthIn: number,
  ): Promise<ArModels>;
  estimateDims(
    img: HTMLImageElement,
    widthIn: number | null,
    heightIn: number | null,
    depthIn: number | null,
  ): { w: number; h: number; d: number };
  rebuildForDimFix(
    getPhoto: (path: string) => Promise<Blob | null>,
    mdPath: string,
    before: ParsedPainting,
    edits: PaintingEdits,
    onRebuildStart?: () => void,
  ): Promise<DimFixResult>;
}

const pending = new Map<string, Promise<void>>();

/** Inject a <script> once per URL; concurrent callers share one load. */
export function loadScript(src: string, module: boolean): Promise<void> {
  let p = pending.get(src);
  if (p === undefined) {
    p = new Promise<void>((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      if (module) el.type = "module";
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error(`Couldn't load ${src}`));
      document.head.appendChild(el);
    });
    pending.set(src, p);
  }
  return p;
}

/** Viewer side effects (registers <model-viewer>) — idempotent. */
export function loadModelViewer(): Promise<void> {
  return loadScript(MODEL_VIEWER_URL, true);
}

/** Builder namespace off window.ArTooling (IIFE global, typed in client-globals). */
export async function loadArTooling(): Promise<ArTooling> {
  await loadScript(AR_TOOLING_URL, false);
  const api = window.ArTooling;
  if (api === undefined) throw new Error("The AR builder didn't start.");
  return api;
}
