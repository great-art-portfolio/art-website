/** On-demand loader for the vendored 3D bundles, which keeps about 1.4MB out
 * of Vite's graph. Uses <script> tags because Vite dev won't serve /public
 * files as modules. */
import type { ArModels, DimFixResult } from "./ar";
import type { PaintingEdits, ParsedPainting } from "./painting-edit";
import type { WallArWords } from "./wall-ar";

export const MODEL_VIEWER_URL = "/js/model-viewer.js";
export const AR_TOOLING_URL = "/js/ar-tooling.js";

/** The ar-tooling entry points used by the admin flows. */
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

/** Injects a <script> once per URL. Concurrent callers share one load. */
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

/** model-viewer's ar-modes for this browser. Android tries in-browser
 * WebXR first: the Google app's Scene Viewer closes the moment it opens
 * since its fall 2026 updates (arcore-android-sdk #1795, #1797), and
 * WebXR is the only AR that still works there. Scene Viewer stays as the
 * fallback for browsers without WebXR. Elsewhere webxr stays off, since
 * touching navigator.xr costs the page its instant Back. */
export function arModes(userAgent: string): string {
  return /android/i.test(userAgent)
    ? "webxr scene-viewer quick-look"
    : "scene-viewer quick-look";
}

/** three.js draws AR through WebXR Layers whenever the browser lists
 * createProjectionLayer, without checking the session enabled them. Kiwi
 * (Chromium 137) lists it, then rejects the layer, so AR closed the moment
 * it opened. Hiding it sends three down the classic XRWebGLLayer path,
 * which every WebXR browser has; the viewer never asks for layers. */
export function hideXrLayers(): void {
  const binding: unknown = Reflect.get(window, "XRWebGLBinding");
  if (typeof binding !== "function") return;
  const proto: unknown = Reflect.get(binding, "prototype");
  if (typeof proto === "object" && proto !== null) {
    Reflect.deleteProperty(proto, "createProjectionLayer");
  }
}

/** Loads the viewer, which registers <model-viewer>. Idempotent. */
export function loadModelViewer(): Promise<void> {
  hideXrLayers();
  return loadScript(MODEL_VIEWER_URL, true);
}

/** On Android, "View on your wall" opens our wall viewer (an outline to
 * aim, tap to hang) instead of model-viewer's own AR. model-viewer stays
 * the fallback when it can't open. Call after loadModelViewer(). */
export function wireWallAr(
  viewer: HTMLElement,
  button: HTMLButtonElement,
  glb: string,
  words: WallArWords,
): void {
  const api = window.WallAr;
  if (api === undefined || !/android/i.test(navigator.userAgent)) return;
  void api.supported().then((ok) => {
    if (!ok) return;
    button.addEventListener("click", (e) => {
      // model-viewer listens on the button's slot; keep the tap ours.
      e.stopPropagation();
      api.start({ glb, words }).catch(() => {
        const fallback: unknown = Reflect.get(viewer, "activateAR");
        if (typeof fallback === "function") void fallback.call(viewer);
      });
    });
  });
}

/** Loads the AR builder and returns the window.ArTooling global. */
export async function loadArTooling(): Promise<ArTooling> {
  await loadScript(AR_TOOLING_URL, false);
  const api = window.ArTooling;
  if (api === undefined) throw new Error("The AR builder didn't start.");
  return api;
}
