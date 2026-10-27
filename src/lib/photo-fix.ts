/**
 * Crop & adjust for painting photos. She drags four corners onto the
 * canvas edges (or "Find edges" guesses them), and the photo is
 * straightened into a flat rectangle with optional brightness, warmth and
 * contrast. Pure math, so it runs in unit tests without a DOM.
 */

export interface Pt {
  x: number;
  y: number;
}

/** Corners as fractions of the (rotated) photo, clockwise from top-left. */
export type Quad = [Pt, Pt, Pt, Pt];

export interface Tone {
  /** -1..1, about one stop either way. */
  brightness: number;
  /** -1..1, cooler (blue) to warmer (amber). */
  warmth: number;
  /** -1..1, flatter to punchier. */
  contrast: number;
}

export interface PhotoFix {
  quad: Quad;
  tone: Tone;
}

export const WHOLE: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

export const FLAT: Tone = { brightness: 0, warmth: 0, contrast: 0 };

/** The same function applied to each corner, keeping the tuple type. */
export function mapQuad(q: Quad, f: (p: Pt) => Pt): Quad {
  return [f(q[0]), f(q[1]), f(q[2]), f(q[3])];
}

const close = (a: Pt, b: Pt): boolean =>
  Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

export function isWhole(q: Quad): boolean {
  return (
    close(q[0], WHOLE[0]) &&
    close(q[1], WHOLE[1]) &&
    close(q[2], WHOLE[2]) &&
    close(q[3], WHOLE[3])
  );
}

export function isFlat(tone: Tone): boolean {
  return tone.brightness === 0 && tone.warmth === 0 && tone.contrast === 0;
}

/** True when the fix changes nothing, so the plain photo can be used. */
export function isNoop(fix: PhotoFix | null): boolean {
  return fix === null || (isWhole(fix.quad) && isFlat(fix.tone));
}

/** The same corners after a quarter turn of the photo, so a fix survives
 * the rotate buttons. Clockwise: (x, y) → (1 − y, x), and the top-left
 * corner becomes what was bottom-left. */
export function rotateQuad(quad: Quad, deg: 90 | 180 | 270): Quad {
  const turn = (q: Quad): Quad => {
    const r = mapQuad(q, (p) => ({ x: 1 - p.y, y: p.x }));
    return [r[3], r[0], r[1], r[2]];
  };
  let out = quad;
  for (let i = 0; i < deg / 90; i++) out = turn(out);
  return out;
}

/**
 * Projective map from the unit square onto a quad (Heckbert's square-to-
 * quad). Returns a function taking (u, v) in 0..1 to a point on the quad.
 */
export function squareToQuad(q: Quad): (u: number, v: number) => Pt {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  let g = 0;
  let h = 0;
  const det = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(dx3) > 1e-12 || Math.abs(dy3) > 1e-12) {
    if (Math.abs(det) > 1e-12) {
      g = (dx3 * dy2 - dx2 * dy3) / det;
      h = (dx1 * dy3 - dx3 * dy1) / det;
    }
  }
  const a = p1.x - p0.x + g * p1.x;
  const b = p3.x - p0.x + h * p3.x;
  const c = p0.x;
  const d = p1.y - p0.y + g * p1.y;
  const e = p3.y - p0.y + h * p3.y;
  const f = p0.y;
  return (u, v) => {
    const w = g * u + h * v + 1;
    return { x: (a * u + b * v + c) / w, y: (d * u + e * v + f) / w };
  };
}

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Output size in pixels for a quad on a photo `srcW` × `srcH`. Her
 * measured width and height set the shape when she has entered them (so
 * the wall preview stays true to size); otherwise the quad's own side
 * lengths do. The long side keeps the photo's detail, up to `maxSide`.
 */
export function outputSize(
  quad: Quad,
  srcW: number,
  srcH: number,
  maxSide: number,
  dims: { widthIn: number | null; heightIn: number | null } = {
    widthIn: null,
    heightIn: null,
  },
): { width: number; height: number } {
  const px = mapQuad(quad, (p) => ({ x: p.x * srcW, y: p.y * srcH }));
  const w = (dist(px[0], px[1]) + dist(px[3], px[2])) / 2;
  const h = (dist(px[0], px[3]) + dist(px[1], px[2])) / 2;
  const aspect =
    dims.widthIn !== null && dims.heightIn !== null
      ? dims.widthIn / dims.heightIn
      : w / Math.max(h, 1);
  const long = Math.min(maxSide, Math.max(w, h));
  return aspect >= 1
    ? {
        width: Math.round(long),
        height: Math.max(1, Math.round(long / aspect)),
      }
    : {
        width: Math.max(1, Math.round(long * aspect)),
        height: Math.round(long),
      };
}

/** Per-channel lookup tables for a tone, so the warp applies it per pixel
 * with three array reads. */
export function toneTables(tone: Tone): [Uint8Array, Uint8Array, Uint8Array] {
  const gain = Math.pow(2, tone.brightness);
  const k = 1 + tone.contrast * 0.6;
  const warm = tone.warmth * 0.12;
  const gains = [
    gain * (1 + warm),
    gain * (1 + warm * 0.25),
    gain * (1 - warm),
  ];
  return gains.map((cg) => {
    const t = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      const v = ((i / 255) * cg - 0.5) * k + 0.5;
      t[i] = Math.max(0, Math.min(255, Math.round(v * 255)));
    }
    return t;
  }) as [Uint8Array, Uint8Array, Uint8Array];
}

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Applies a tone in place. */
export function applyTone(px: Pixels, tone: Tone): void {
  if (isFlat(tone)) return;
  const [r, g, b] = toneTables(tone);
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = r[d[i] ?? 0] ?? 0;
    d[i + 1] = g[d[i + 1] ?? 0] ?? 0;
    d[i + 2] = b[d[i + 2] ?? 0] ?? 0;
  }
}

/**
 * Straightens the quad of `src` into an `outW` × `outH` image with
 * bilinear sampling, applying the tone on the way.
 */
export function warp(
  src: Pixels,
  quad: Quad,
  outW: number,
  outH: number,
  tone: Tone = FLAT,
): Uint8ClampedArray<ArrayBuffer> {
  const map = squareToQuad(
    mapQuad(quad, (p) => ({
      x: p.x * (src.width - 1),
      y: p.y * (src.height - 1),
    })),
  );
  const [tr, tg, tb] = toneTables(tone);
  const out = new Uint8ClampedArray(outW * outH * 4);
  const s = src.data;
  const sw = src.width;
  const maxX = src.width - 1;
  const maxY = src.height - 1;
  for (let y = 0; y < outH; y++) {
    const v = outH === 1 ? 0 : y / (outH - 1);
    for (let x = 0; x < outW; x++) {
      const u = outW === 1 ? 0 : x / (outW - 1);
      const p = map(u, v);
      const fx = Math.max(0, Math.min(maxX, p.x));
      const fy = Math.max(0, Math.min(maxY, p.y));
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(maxX, x0 + 1);
      const y1 = Math.min(maxY, y0 + 1);
      const ax = fx - x0;
      const ay = fy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      const o = (y * outW + x) * 4;
      for (let c = 0; c < 3; c++) {
        const a00 = s[i00 + c] ?? 0;
        const a01 = s[i01 + c] ?? 0;
        const top = a00 + ((s[i10 + c] ?? 0) - a00) * ax;
        const bot = a01 + ((s[i11 + c] ?? 0) - a01) * ax;
        const val = Math.round(top + (bot - top) * ay);
        out[o + c] = (c === 0 ? tr : c === 1 ? tg : tb)[val] ?? 0;
      }
      out[o + 3] = 255;
    }
  }
  return out;
}

/**
 * Guesses the painting's corners in a small copy of the photo (about 256
 * px on the long side). Pixels unlike every colour around the photo's
 * border count as painting; the biggest connected patch of them is the
 * painting, and its extreme points along the diagonals are the corners.
 * Null when there's no clear patch: the painting fills the photo, or it
 * looks too much like its background.
 */
export function findCorners(px: Pixels): Quad | null {
  const { data, width: w, height: h } = px;
  if (w < 16 || h < 16) return null;
  // Background colours sampled around the border, a few pixels in.
  const inset = Math.max(1, Math.round(Math.min(w, h) * 0.02));
  const samples: Array<[number, number, number]> = [];
  const at = (x: number, y: number): [number, number, number] => {
    const i = (y * w + x) * 4;
    return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
  };
  const steps = 24;
  for (let i = 0; i < steps; i++) {
    const fx = Math.round(inset + ((w - 1 - 2 * inset) * i) / (steps - 1));
    const fy = Math.round(inset + ((h - 1 - 2 * inset) * i) / (steps - 1));
    samples.push(
      at(fx, inset),
      at(fx, h - 1 - inset),
      at(inset, fy),
      at(w - 1 - inset, fy),
    );
  }
  const near = 42 * 42;
  const fg = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let best = Infinity;
      for (const s of samples) {
        const dr = (data[i] ?? 0) - s[0];
        const dg = (data[i + 1] ?? 0) - s[1];
        const db = (data[i + 2] ?? 0) - s[2];
        const d2 = dr * dr + dg * dg + db * db;
        if (d2 < best) best = d2;
        if (best < near) break;
      }
      fg[y * w + x] = best >= near ? 1 : 0;
    }
  }
  // Largest 4-connected patch.
  const label = new Int32Array(w * h).fill(-1);
  const stack = new Int32Array(w * h);
  let bestId = -1;
  let bestSize = 0;
  let id = 0;
  for (let start = 0; start < w * h; start++) {
    if (fg[start] === 0 || label[start] !== -1) continue;
    let top = 0;
    stack[top++] = start;
    label[start] = id;
    let size = 0;
    while (top > 0) {
      const p = stack[--top] ?? 0;
      size++;
      const x = p % w;
      const y = (p - x) / w;
      const next = [
        x > 0 ? p - 1 : -1,
        x < w - 1 ? p + 1 : -1,
        y > 0 ? p - w : -1,
        y < h - 1 ? p + w : -1,
      ];
      for (const n of next) {
        if (n >= 0 && fg[n] === 1 && label[n] === -1) {
          label[n] = id;
          stack[top++] = n;
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestId = id;
    }
    id++;
  }
  if (bestId < 0 || bestSize < w * h * 0.08) return null;
  // Extreme points: top-left minimises x + y, top-right maximises x − y,
  // bottom-right maximises x + y, bottom-left maximises y − x.
  let tl = { s: Infinity, x: 0, y: 0 };
  let tr = { s: -Infinity, x: 0, y: 0 };
  let br = { s: -Infinity, x: 0, y: 0 };
  let bl = { s: -Infinity, x: 0, y: 0 };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (label[y * w + x] !== bestId) continue;
      if (x + y < tl.s) tl = { s: x + y, x, y };
      if (x - y > tr.s) tr = { s: x - y, x, y };
      if (x + y > br.s) br = { s: x + y, x, y };
      if (y - x > bl.s) bl = { s: y - x, x, y };
    }
  }
  const quad = mapQuad([tl, tr, br, bl], (p) => ({
    x: p.x / (w - 1),
    y: p.y / (h - 1),
  }));
  // A patch reaching every edge is the whole photo: nothing to crop.
  const margin = 0.015;
  const touches =
    Math.min(quad[0].x, quad[3].x) < margin &&
    Math.min(quad[0].y, quad[1].y) < margin &&
    Math.max(quad[1].x, quad[2].x) > 1 - margin &&
    Math.max(quad[2].y, quad[3].y) > 1 - margin;
  if (touches) return null;
  if (quadArea(quad) < 0.08) return null;
  return quad;
}

/** Area of a quad (shoelace), in the same units as its corners. */
export function quadArea(q: Quad): number {
  const [a, b, c, d] = q;
  const twice =
    a.x * b.y -
    b.x * a.y +
    (b.x * c.y - c.x * b.y) +
    (c.x * d.y - d.x * c.y) +
    (d.x * a.y - a.x * d.y);
  return Math.abs(twice) / 2;
}

/** True when the corners still make a sensible shape: convex and in
 * clockwise order, so the warp can't fold the picture over itself. */
export function isConvex(q: Quad): boolean {
  const [p0, p1, p2, p3] = q;
  const turn = (a: Pt, b: Pt, c: Pt): number =>
    (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  const turns = [
    turn(p0, p1, p2),
    turn(p1, p2, p3),
    turn(p2, p3, p0),
    turn(p3, p0, p1),
  ];
  return turns.every((t) => t > 1e-9);
}
