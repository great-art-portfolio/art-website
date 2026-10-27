/** Crop & adjust dialog for the studio rooms. She drags four corners onto
 * the painting's edges ("Find edges" guesses them first) and nudges
 * brightness, warmth and contrast. Resolves with the fix, or null when she
 * cancels. The pixels are only changed later, by prepareImage. */
import { drawPrepared } from "../lib/image";
import {
  FLAT,
  WHOLE,
  applyTone,
  findCorners,
  isConvex,
  mapQuad,
  type PhotoFix,
  type Pt,
  type Quad,
  type Tone,
} from "../lib/photo-fix";
import { $ } from "../lib/dom";

/** The preview canvas is sharp on a phone without being slow to tone. */
const PREVIEW_SIDE = 1400;
/** Edge finding works on a small copy: fast, and blurs canvas texture. */
const DETECT_SIDE = 256;
const LOUPE_ZOOM = 3;

const HINT_DRAG = "Drag the four corners onto the painting's edges.";
const HINT_FOUND = "Found the edges. Drag a corner if it's a little off.";
const HINT_MISSED =
  "Couldn't find the edges in this photo. Drag the corners onto them.";

interface Session {
  quad: Quad;
  tone: Tone;
  base: ImageData;
  small: ImageData;
  resolve: (fix: PhotoFix | null) => void;
  done: boolean;
}

let session: Session | null = null;
let toneFrame = 0;

function pixelsOf(
  img: HTMLImageElement,
  rotation: 0 | 90 | 180 | 270,
  side: number,
): ImageData {
  const { canvas, width, height } = drawPrepared(img, rotation, side);
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("Canvas is not available in this browser");
  return ctx.getImageData(0, 0, width, height);
}

function sliderTone(): Tone {
  return {
    brightness: Number($("pf-bright").value) / 100,
    warmth: Number($("pf-warm").value) / 100,
    contrast: Number($("pf-contrast").value) / 100,
  };
}

function setSliders(tone: Tone): void {
  $("pf-bright").value = String(Math.round(tone.brightness * 100));
  $("pf-warm").value = String(Math.round(tone.warmth * 100));
  $("pf-contrast").value = String(Math.round(tone.contrast * 100));
}

/** Redraws the photo with the current tone. */
function drawTone(): void {
  if (session === null) return;
  const { base, tone } = session;
  const copy = new ImageData(
    new Uint8ClampedArray(base.data),
    base.width,
    base.height,
  );
  applyTone(copy, tone);
  $("pf-canvas").getContext("2d")?.putImageData(copy, 0, 0);
}

/** Moves the handles, outline and shade to the current corners. */
function drawQuad(): void {
  if (session === null) return;
  const q = session.quad;
  const pts = q.map(
    (p) => `${(p.x * 1000).toFixed(1)},${(p.y * 1000).toFixed(1)}`,
  );
  $("pf-edge").setAttribute("points", pts.join(" "));
  $("pf-shade").setAttribute("d", `M0 0H1000V1000H0Z M${pts.join(" L")}Z`);
  for (const h of document.querySelectorAll<HTMLElement>(
    "#pf-stage .pf-handle",
  )) {
    const p = q[Number(h.dataset.corner)];
    if (p === undefined) continue;
    h.style.left = `${p.x * 100}%`;
    h.style.top = `${p.y * 100}%`;
  }
}

function hint(text: string): void {
  $("pf-hint").textContent = text;
}

function findEdges(): void {
  if (session === null) return;
  const found = findCorners(session.small);
  if (found === null) {
    hint(HINT_MISSED);
    return;
  }
  session.quad = found;
  hint(HINT_FOUND);
  drawQuad();
}

/** Corner `i` moved to `p`, kept inside the photo and only while the shape
 * stays a sensible four-sided one. */
function moveCorner(i: number, p: Pt): void {
  if (session === null) return;
  const clamped = {
    x: Math.min(1, Math.max(0, p.x)),
    y: Math.min(1, Math.max(0, p.y)),
  };
  const next = mapQuad(session.quad, (c) => c);
  if (i === 0) next[0] = clamped;
  else if (i === 1) next[1] = clamped;
  else if (i === 2) next[2] = clamped;
  else next[3] = clamped;
  if (!isConvex(next)) return;
  session.quad = next;
  drawQuad();
}

/** Magnified view around a corner, in the top corner away from it. */
function drawLoupe(at: Pt): void {
  const loupe = $("pf-loupe");
  const src = $("pf-canvas");
  const ctx = loupe.getContext("2d");
  if (ctx === null) return;
  const shown = src.getBoundingClientRect().width;
  if (shown === 0) return;
  // Source pixels covering the loupe's CSS width at LOUPE_ZOOM.
  const span =
    (loupe.getBoundingClientRect().width / LOUPE_ZOOM) * (src.width / shown);
  const cx = at.x * src.width;
  const cy = at.y * src.height;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, loupe.width, loupe.height);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(
    src,
    cx - span / 2,
    cy - span / 2,
    span,
    span,
    0,
    0,
    loupe.width,
    loupe.height,
  );
  const mid = loupe.width / 2;
  ctx.strokeStyle = "rgb(255 255 255 / 0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(mid - 18, mid);
  ctx.lineTo(mid + 18, mid);
  ctx.moveTo(mid, mid - 18);
  ctx.lineTo(mid, mid + 18);
  ctx.stroke();
  loupe.dataset.side = at.x < 0.5 ? "right" : "left";
  loupe.hidden = false;
}

function finish(fix: PhotoFix | null): void {
  if (session === null || session.done) return;
  session.done = true;
  const { resolve } = session;
  session = null;
  const dialog = $("photo-fix");
  if (dialog.open) dialog.close();
  resolve(fix);
}

/** Wires the dialog once per document (View Transitions swap it). */
function wire(dialog: HTMLDialogElement): void {
  if (dialog.dataset.wired === "1") return;
  dialog.dataset.wired = "1";
  const stage = $("pf-stage");

  for (const handle of stage.querySelectorAll<HTMLButtonElement>(
    ".pf-handle",
  )) {
    const i = Number(handle.dataset.corner);
    // Where on the handle the finger landed, so the corner doesn't jump.
    let grab = { x: 0, y: 0 };
    const toPhoto = (e: PointerEvent): Pt => {
      const r = stage.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) / r.width - grab.x,
        y: (e.clientY - r.top) / r.height - grab.y,
      };
    };
    handle.addEventListener("pointerdown", (e) => {
      const corner = session?.quad[i];
      if (corner === undefined) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      handle.dataset.active = "";
      const r = stage.getBoundingClientRect();
      grab = {
        x: (e.clientX - r.left) / r.width - corner.x,
        y: (e.clientY - r.top) / r.height - corner.y,
      };
      if (e.pointerType !== "mouse") drawLoupe(corner);
    });
    handle.addEventListener("pointermove", (e) => {
      if (session === null || !handle.hasPointerCapture(e.pointerId)) return;
      moveCorner(i, toPhoto(e));
      hint(HINT_DRAG);
      const moved = session.quad[i];
      if (e.pointerType !== "mouse" && moved !== undefined) drawLoupe(moved);
    });
    const release = (): void => {
      delete handle.dataset.active;
      $("pf-loupe").hidden = true;
    };
    handle.addEventListener("pointerup", release);
    handle.addEventListener("pointercancel", release);
    handle.addEventListener("keydown", (e) => {
      const c = session?.quad[i];
      if (c === undefined) return;
      const step = e.shiftKey ? 0.02 : 0.002;
      const d =
        e.key === "ArrowLeft"
          ? { x: -step, y: 0 }
          : e.key === "ArrowRight"
            ? { x: step, y: 0 }
            : e.key === "ArrowUp"
              ? { x: 0, y: -step }
              : e.key === "ArrowDown"
                ? { x: 0, y: step }
                : null;
      if (d === null) return;
      e.preventDefault();
      moveCorner(i, { x: c.x + d.x, y: c.y + d.y });
    });
  }

  for (const id of ["pf-bright", "pf-warm", "pf-contrast"] as const) {
    $(id).addEventListener("input", () => {
      if (session === null) return;
      session.tone = sliderTone();
      cancelAnimationFrame(toneFrame);
      toneFrame = requestAnimationFrame(drawTone);
    });
  }
  $("pf-find").addEventListener("click", findEdges);
  $("pf-whole").addEventListener("click", () => {
    if (session === null) return;
    session.quad = WHOLE;
    hint(HINT_DRAG);
    drawQuad();
  });
  $("pf-reset").addEventListener("click", () => {
    if (session === null) return;
    session.quad = WHOLE;
    session.tone = FLAT;
    setSliders(FLAT);
    hint(HINT_DRAG);
    drawQuad();
    drawTone();
  });
  $("pf-cancel").addEventListener("click", () => finish(null));
  $("pf-done").addEventListener("click", () => {
    if (session === null) return;
    finish({ quad: session.quad, tone: session.tone });
  });
  // Escape, or the dialog closing any other way, counts as Cancel.
  dialog.addEventListener("close", () => finish(null));
}

/** Opens the dialog on the photo as currently rotated. `start` is the
 * fix she made last time, else the dialog opens on a guess at the edges. */
export function openPhotoFix(
  img: HTMLImageElement,
  rotation: 0 | 90 | 180 | 270,
  start: PhotoFix | null,
): Promise<PhotoFix | null> {
  const dialog = $("photo-fix");
  wire(dialog);
  if (session !== null) finish(null);
  const base = pixelsOf(img, rotation, PREVIEW_SIDE);
  const small = pixelsOf(img, rotation, DETECT_SIDE);
  const canvas = $("pf-canvas");
  canvas.width = base.width;
  canvas.height = base.height;
  const overlay = $("pf-overlay");
  overlay.setAttribute("viewBox", "0 0 1000 1000");
  overlay.setAttribute("preserveAspectRatio", "none");
  $("pf-stage").style.setProperty(
    "--pf-aspect",
    String(base.width / base.height),
  );
  $("pf-loupe").hidden = true;
  return new Promise((resolve) => {
    session = {
      quad: start?.quad ?? WHOLE,
      tone: start?.tone ?? FLAT,
      base,
      small,
      resolve,
      done: false,
    };
    setSliders(session.tone);
    drawTone();
    if (start === null) {
      const found = findCorners(small);
      if (found !== null) session.quad = found;
      hint(found === null ? HINT_DRAG : HINT_FOUND);
    } else {
      hint(HINT_DRAG);
    }
    drawQuad();
    dialog.showModal();
    $("pf-done").focus();
  });
}
