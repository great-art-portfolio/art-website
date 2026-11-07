/** On-demand loader for the vendored 3D bundles, which keeps about 1.4MB out
 * of Vite's graph. Uses <script> tags because Vite dev won't serve /public
 * files as modules. */
import type { ArModels, DimFixResult } from "./ar";
import type { PaintingEdits, ParsedPainting } from "./painting-edit";
import { reportError } from "./report";
import { VENDOR_HASHES } from "./vendor-hashes";
import type { WallArWords } from "./wall-ar";

export const MODEL_VIEWER_URL = `/js/model-viewer.js?v=${VENDOR_HASHES["model-viewer.js"]}`;
export const AR_TOOLING_URL = `/js/ar-tooling.js?v=${VENDOR_HASHES["ar-tooling.js"]}`;

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

/** Wires "View on your wall". On Android it opens our wall viewer (an
 * outline to aim, tap to hang), with model-viewer's own AR as the fallback
 * when ours can't start. Any way it fails, the buyer is told (`onFail`)
 * and the failure is logged: a dead button with no word is the worst
 * outcome. Call after loadModelViewer(). */
export function wireWallAr(
  viewer: HTMLElement,
  button: HTMLButtonElement,
  glb: string,
  words: WallArWords,
  onFail: () => void,
): void {
  const android = /android/i.test(navigator.userAgent);
  const failed = (event: string, err: unknown, detail = {}) => {
    reportError(`ar.${event}`, err, { glb, ...detail });
    onFail();
  };
  let sessionStarted = false;
  viewer.addEventListener("ar-status", (e) => {
    const status: unknown =
      e instanceof CustomEvent ? Reflect.get(Object(e.detail), "status") : null;
    if (status === "session-started") sessionStarted = true;
    if (status === "failed") failed("viewer_failed", new Error("AR failed"));
  });
  // Scene Viewer can't report failure: when the Google app's viewer
  // crashes it hands straight back to the page, and when the browser
  // blocks it nothing happens at all. Watch for both on Android (iPhone's
  // Quick Look opens over the page, so it never leaves it).
  const watchSceneViewer = () => {
    if (!android) return;
    sessionStarted = false;
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = performance.now();
        return;
      }
      document.removeEventListener("visibilitychange", onVisibility);
      const away = performance.now() - hiddenAt;
      if (away < 1500)
        failed("viewer_bounced", new Error("AR viewer closed at once"), {
          ms: Math.round(away),
        });
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.setTimeout(() => {
      if (hiddenAt !== 0) return;
      document.removeEventListener("visibilitychange", onVisibility);
      if (!sessionStarted)
        failed("viewer_not_opened", new Error("AR viewer didn't open"));
    }, 3000);
  };
  const fallBack = () => {
    watchSceneViewer();
    const activate: unknown = Reflect.get(viewer, "activateAR");
    if (typeof activate === "function") void activate.call(viewer);
  };

  let ours = false;
  const api = window.WallAr;
  if (android && api !== undefined) {
    void api.supported().then((ok) => (ours = ok));
  }
  button.addEventListener("click", (e) => {
    if (!ours || api === undefined) {
      watchSceneViewer();
      return;
    }
    // model-viewer listens on the button's slot; keep the tap ours.
    e.stopPropagation();
    api.start({ glb, words }).catch((err: unknown) => {
      if (Reflect.get(Object(err), "opened") === true) {
        failed("wall_stopped", err);
      } else {
        reportError("ar.wall_start_failed", err, { glb }, "warn");
        fallBack();
      }
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
