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

/** Injects a <script> once per URL. Concurrent callers share one load; a
 * failed load is retried by the next caller. */
export function loadScript(src: string, module: boolean): Promise<void> {
  let p = pending.get(src);
  if (p === undefined) {
    p = new Promise<void>((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      if (module) el.type = "module";
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => {
        // Forget the failure, so the next try loads it afresh instead of
        // failing until the page is reloaded.
        pending.delete(src);
        el.remove();
        reject(new Error(`Couldn't load ${src}`));
      };
      document.head.appendChild(el);
    });
    pending.set(src, p);
  }
  return p;
}

/** model-viewer's ar-modes for this browser. Android opens Google's Scene
 * Viewer first; when the Google app's viewer closes at once (its fall 2026
 * updates, arcore-android-sdk #1795, #1797), wireWallAr falls back to our
 * WebXR viewer. model-viewer's own WebXR stays for browsers that can't
 * open Scene Viewer. Elsewhere webxr stays off, since touching navigator.xr
 * costs the page its instant Back. */
export function arModes(userAgent: string): string {
  return /android/i.test(userAgent)
    ? "scene-viewer webxr quick-look"
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

/** Remembered for the visit: Google's viewer bounced, so later taps go
 * straight to ours. Storage can be blocked; then each page tries Google
 * once. */
const GOOGLE_OUT = "wallAr.googleOut";
function googleOut(): boolean {
  try {
    return sessionStorage.getItem(GOOGLE_OUT) === "1";
  } catch {
    // Blocked storage: try Google's viewer again.
    return false;
  }
}
function markGoogleOut(): void {
  try {
    sessionStorage.setItem(GOOGLE_OUT, "1");
  } catch {
    // Blocked storage: this page still remembers (see `fellBack`).
  }
}

/** Wires "View on your wall". On Android it opens Google's viewer (Scene
 * Viewer) first; if that closes at once or never opens, the same button
 * opens our wall viewer instead for the rest of the visit (`onFallback`
 * relabels it "Try again with fallback", on every page after that too). Our viewer is tried at once too,
 * but browsers want a fresh tap to start AR, so in practice the second tap
 * opens it. Real failures are said (`onFail`) and
 * logged. Call after loadModelViewer(). */
export function wireWallAr(
  viewer: HTMLElement,
  button: HTMLButtonElement,
  glb: string,
  words: WallArWords,
  onFail: () => void,
  onFallback: () => void,
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

  let ours = false;
  let fellBack = false;
  const api = window.WallAr;
  if (android && api !== undefined) {
    void api.supported().then((ok) => {
      ours = ok;
      // Google's viewer already bounced earlier in this visit, so this
      // button opens ours: say so here too, not only on the page it
      // bounced on.
      if (ok && googleOut()) onFallback();
    });
  }
  const startOurs = (afterBounce: boolean) => {
    if (api === undefined) return;
    api.start({ glb, words }).catch((err: unknown) => {
      if (Reflect.get(Object(err), "opened") === true) {
        failed("wall_stopped", err);
      } else if (!afterBounce) {
        failed("wall_start_failed", err);
      }
      // After a bounce the browser may want a fresh tap: the button now
      // opens ours, and its label says so.
    });
  };
  // Google's viewer can't report failure: when the Google app's viewer
  // crashes it hands straight back to the page, and when the browser
  // blocks it nothing happens at all. Either way, fall back to ours.
  const watchGoogle = () => {
    sessionStarted = false;
    let hiddenAt = 0;
    const toOurs = (event: string, detail = {}) => {
      reportError(
        `ar.${event}`,
        new Error("Google's viewer didn't stay open"),
        { glb, ...detail },
        "warn",
      );
      if (!ours) {
        onFail();
        return;
      }
      fellBack = true;
      markGoogleOut();
      onFallback();
      startOurs(true);
    };
    // The page loses focus when the viewer opens, and often isn't even
    // hidden before a crashing viewer hands it back, so focus is the signal.
    // Acting at once keeps the tap's user activation, which our viewer
    // needs to start.
    let settled = false;
    const stop = () => {
      settled = true;
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    const onBlur = () => {
      if (hiddenAt === 0) hiddenAt = performance.now();
    };
    const onFocus = () => {
      if (hiddenAt === 0 || settled) return;
      const away = performance.now() - hiddenAt;
      stop();
      if (away < 1500) toOurs("viewer_bounced", { ms: Math.round(away) });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onBlur();
      else onFocus();
    };
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.setTimeout(() => {
      if (settled || hiddenAt !== 0) return;
      stop();
      if (!sessionStarted) toOurs("viewer_not_opened");
    }, 3000);
  };

  button.addEventListener("click", (e) => {
    if (!android) return;
    if (ours && (fellBack || googleOut())) {
      // model-viewer listens on the button's slot; keep the tap ours.
      e.stopPropagation();
      startOurs(false);
      return;
    }
    watchGoogle();
  });
}

/** Loads the AR builder and returns the window.ArTooling global. */
export async function loadArTooling(): Promise<ArTooling> {
  await loadScript(AR_TOOLING_URL, false);
  const api = window.ArTooling;
  if (api === undefined) throw new Error("The AR builder didn't start.");
  return api;
}
