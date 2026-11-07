import { ROOM } from "./room-data";

/**
 * Where a painting hangs in the living-room render, at true size. The
 * camera faces the wall square on, so the wall has one scale: inches
 * become pixels by ROOM.pxPerMeter. The painting's bottom edge sits 9 in
 * above the sofa back, centred on the sofa, as a designer would hang it.
 *
 * The view is cropped closer than the full render (still true scale) so
 * small paintings stay visible on a phone: about twice the sofa's width,
 * wider for a big painting. Every number is a percentage of the box it
 * sits in, so the page needs no script.
 */

const INCH_M = 0.0254;
/** Gap between the sofa back and the painting's bottom edge. */
const ABOVE_SOFA_IN = 9;
/** The crop is 3:2, like the render. */
const ASPECT = 3 / 2;

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RoomLayout {
  /** Width / height of the shown crop. */
  aspect: number;
  /** The whole render inside the crop (percent of the crop). */
  stage: Box;
  /** The painting inside the render (percent of the render). */
  art: Box;
  /** The render's light map inside the painting (percent of the painting),
   * multiplied over it so the window's falloff lands on it. */
  light: Box;
}

/** Null when the painting has no usable size. */
export function roomLayout(
  widthIn: number,
  heightIn: number,
): RoomLayout | null {
  if (!(widthIn > 0 && heightIn > 0)) return null;
  const ppm = ROOM.pxPerMeter;
  const w = widthIn * INCH_M * ppm;
  const h = heightIn * INCH_M * ppm;
  const left = ROOM.wallOriginX - w / 2;
  const top =
    ROOM.wallOriginY - (ROOM.sofaTopM + ABOVE_SOFA_IN * INCH_M) * ppm - h;

  // A crop about the sofa and its neighbours, or more for a big painting,
  // kept inside the render.
  let cw = Math.max(ROOM.sofaWidthM * ppm * 1.9, w * 2.6);
  cw = Math.min(cw, ROOM.width, ROOM.height * ASPECT);
  const ch = cw / ASPECT;
  const cx = ROOM.wallOriginX;
  const cy = (top + ROOM.wallOriginY) / 2 + ch * 0.06;
  const cl = clamp(cx - cw / 2, 0, ROOM.width - cw);
  const ct = clamp(cy - ch / 2, 0, ROOM.height - ch);

  const pct = (v: number, of: number) => round((v / of) * 100);
  return {
    aspect: ASPECT,
    stage: {
      left: pct(-cl, cw),
      top: pct(-ct, ch),
      width: pct(ROOM.width, cw),
      height: pct(ROOM.height, ch),
    },
    art: {
      left: pct(left, ROOM.width),
      top: pct(top, ROOM.height),
      width: pct(w, ROOM.width),
      height: pct(h, ROOM.height),
    },
    light: {
      left: pct(-left, w),
      top: pct(-top, h),
      width: pct(ROOM.width, w),
      height: pct(ROOM.height, h),
    },
  };
}

/** The sofa's width, for the caption. */
export const SOFA_WIDTH_IN = Math.round(ROOM.sofaWidthM / INCH_M);

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
