/** QR codes: procedural painted-acrylic SVGs for printable gallery labels and
 * desktop AR blocks, and crisp minimal SVGs for the studio's 13px row icons. */
import qrcode from "qrcode-generator";
import type { Locale } from "../i18n/locales";
import { SITE_URL } from "./site";

/** Absolute production URL of a painting's buyer page, in a language:
 * English at the root, others under /<code>/. */
export function paintingPageUrl(slug: string, locale: Locale = "en"): string {
  const prefix = locale === "en" ? "" : `/${locale}`;
  return `${SITE_URL}${prefix}/paintings/${slug}`;
}

/** Crisp minimal QR code SVG (used for 13px collection row marks). CSS sizes it. */
export function qrSvg(url: string, margin = 4): string {
  const code = qrcode(0, "M");
  code.addData(url);
  code.make();
  const n = code.getModuleCount();
  const full = n + 2 * margin;
  let d = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n;) {
      if (!code.isDark(y, x)) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < n && code.isDark(y, x + run)) run++;
      d += `M${x + margin} ${y + margin}h${run}v1h-${run}z`;
      x += run;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}" ` +
    `width="240" height="240" shape-rendering="crispEdges">` +
    `<rect width="${full}" height="${full}" fill="#fff"/>` +
    `<path fill="#000" d="${d}"/></svg>`
  );
}

/** Dark studio pigments matching src/assets/artist-plaque-qr.jpg (all <22% lum). */
const PAINT_PALETTE = ["#171d23", "#132230", "#19313b", "#261c17"] as const;

interface BrushStroke {
  gx: number;
  gy: number;
  gw: number;
  gh: number;
  horizontal: boolean;
  pigment: number;
  warmGlint: boolean;
  finder: boolean;
}

function makePrng(seedStr: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  let s = h === 0 ? 1 : h;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function f(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
}

function inFinderBox(x: number, y: number, n: number): boolean {
  return (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
}

/** Organic flat-brush stroke outline: slightly wavy sides, gentle brush swell,
 * and subtle bristle serration on the trailing end, bounded to preserve white
 * quiet gaps between non-adjacent modules. */
function brushOutline(
  s: BrushStroke,
  margin: number,
  rng: () => number,
): string {
  const x0 = s.gx + margin;
  const y0 = s.gy + margin;
  const w = s.gw;
  const h = s.gh;
  const e = s.finder ? 0.02 : 0.032;
  const j1 = (rng() - 0.5) * 0.065;
  const j2 = (rng() - 0.5) * 0.065;
  const t1 = (rng() - 0.5) * 0.04;
  const t2 = (rng() - 0.5) * 0.04;
  const tipA = s.finder ? 0.02 : 0.015 + rng() * 0.03;
  const tipB = s.finder ? -0.01 : -(0.015 + rng() * 0.035);
  const tipC = s.finder ? 0.015 : 0.01 + rng() * 0.03;

  if (s.horizontal) {
    const lx = x0 - e * 0.55;
    const rx = x0 + w + e * 0.55;
    const ty = y0 - e + t1;
    const by = y0 + h + e + t2;
    const mx = (lx + rx) * 0.5;
    const ym = (ty + by) * 0.5;
    return (
      `M${f(lx)} ${f(ty + 0.06)}` +
      `Q${f(mx)} ${f(ty + j1)} ${f(rx - 0.03)} ${f(ty + 0.05)}` +
      `Q${f(rx + tipA)} ${f(y0 + 0.34)} ${f(rx + tipB)} ${f(ym)}` +
      `Q${f(rx + tipC)} ${f(y0 + 0.7)} ${f(rx - 0.03)} ${f(by - 0.05)}` +
      `Q${f(mx)} ${f(by + j2)} ${f(lx)} ${f(by - 0.06)}` +
      `Q${f(lx - 0.05)} ${f(ym)} ${f(lx)} ${f(ty + 0.06)}z`
    );
  }

  const lx = x0 - e + t1;
  const rx = x0 + w + e + t2;
  const ty = y0 - e * 0.55;
  const by = y0 + h + e * 0.55;
  const my = (ty + by) * 0.5;
  const xm = (lx + rx) * 0.5;
  return (
    `M${f(lx + 0.06)} ${f(ty)}` +
    `Q${f(xm)} ${f(ty - 0.05)} ${f(rx - 0.06)} ${f(ty)}` +
    `Q${f(rx + j1)} ${f(my)} ${f(rx - 0.05)} ${f(by - 0.03)}` +
    `Q${f(x0 + 0.66)} ${f(by + tipA)} ${f(xm)} ${f(by + tipB)}` +
    `Q${f(x0 + 0.3)} ${f(by + tipC)} ${f(lx + 0.05)} ${f(by - 0.03)}` +
    `Q${f(lx + j2)} ${f(my)} ${f(lx + 0.06)} ${f(ty)}z`
  );
}

/** Compact cast-shadow silhouette offset to the bottom-right of a stroke. */
function brushShadow(s: BrushStroke, margin: number): string {
  const x = s.gx + margin + 0.07;
  const y = s.gy + margin + 0.09;
  return `M${f(x)} ${f(y)}h${s.gw}v${s.gh}h-${s.gw}z`;
}

function collectFinderStrokes(
  ox: number,
  oy: number,
  strokes: BrushStroke[],
): void {
  const base: Omit<BrushStroke, "gx" | "gy" | "gw" | "gh" | "horizontal"> = {
    pigment: 0,
    warmGlint: false,
    finder: true,
  };
  strokes.push({ ...base, gx: ox, gy: oy, gw: 7, gh: 1, horizontal: true });
  strokes.push({
    ...base,
    gx: ox,
    gy: oy + 6,
    gw: 7,
    gh: 1,
    horizontal: true,
  });
  strokes.push({
    ...base,
    gx: ox,
    gy: oy + 1,
    gw: 1,
    gh: 5,
    horizontal: false,
  });
  strokes.push({
    ...base,
    gx: ox + 6,
    gy: oy + 1,
    gw: 1,
    gh: 5,
    horizontal: false,
  });
  for (let row = 0; row < 3; row++) {
    strokes.push({
      ...base,
      gx: ox + 2,
      gy: oy + 2 + row,
      gw: 3,
      gh: 1,
      horizontal: true,
    });
  }
}

/** Procedural heavy-body acrylic QR code SVG on warm linen canvas using
 * Barbara's dark studio palette. Preserves module centers and white gaps for
 * scanning while keeping zero DOM `id` attributes so multiple cards never clash. */
export function paintedQrSvg(url: string, margin = 4): string {
  const code = qrcode(0, "M");
  code.addData(url);
  code.make();
  const n = code.getModuleCount();
  const full = n + 2 * margin;
  const rng = makePrng(url);

  const visited = Array.from({ length: n }, () => new Uint8Array(n));
  const strokes: BrushStroke[] = [];

  for (const [ox, oy] of [
    [0, 0],
    [n - 7, 0],
    [0, n - 7],
  ] as const) {
    collectFinderStrokes(ox, oy, strokes);
    for (let dy = 0; dy < 7; dy++) {
      const row = visited[oy + dy];
      if (row === undefined) continue;
      for (let dx = 0; dx < 7; dx++) {
        row[ox + dx] = 1;
      }
    }
  }

  const pickPigment = (): number => {
    const r = rng();
    if (r < 0.52) return 0;
    if (r < 0.78) return 1;
    if (r < 0.92) return 2;
    return 3;
  };

  for (let y = 0; y < n; y++) {
    const vRow = visited[y];
    if (vRow === undefined) continue;
    for (let x = 0; x < n; x++) {
      if (vRow[x] === 1 || !code.isDark(y, x)) continue;

      let hMax = 1;
      while (
        hMax < 6 &&
        x + hMax < n &&
        !inFinderBox(x + hMax, y, n) &&
        visited[y]?.[x + hMax] === 0 &&
        code.isDark(y, x + hMax)
      ) {
        hMax++;
      }

      let vMax = 1;
      while (
        vMax < 6 &&
        y + vMax < n &&
        !inFinderBox(x, y + vMax, n) &&
        visited[y + vMax]?.[x] === 0 &&
        code.isDark(y + vMax, x)
      ) {
        vMax++;
      }

      let horizontal: boolean;
      if (hMax === 1 && vMax === 1) {
        horizontal = rng() < 0.5;
      } else if (hMax > 1 && vMax > 1) {
        horizontal =
          hMax > vMax ? rng() < 0.72 : vMax > hMax ? rng() < 0.28 : rng() < 0.5;
      } else {
        horizontal = hMax > 1;
      }

      const maxRun = horizontal ? hMax : vMax;
      const run =
        maxRun <= 2 ? maxRun : Math.min(maxRun, 2 + Math.floor(rng() * 5));
      const gw = horizontal ? run : 1;
      const gh = horizontal ? 1 : run;

      for (let dy = 0; dy < gh; dy++) {
        const vr = visited[y + dy];
        if (vr === undefined) continue;
        for (let dx = 0; dx < gw; dx++) vr[x + dx] = 1;
      }

      const pigment = pickPigment();
      strokes.push({
        gx: x,
        gy: y,
        gw,
        gh,
        horizontal,
        pigment,
        warmGlint: pigment === 3 || (pigment === 0 && rng() < 0.14),
        finder: false,
      });
    }
  }

  let weaveD = "";
  for (let p = 0.36; p < full; p += 0.38) {
    const pos = f(p);
    weaveD += `M0 ${pos}H${full}M${pos} 0V${full}`;
  }

  let shadowD = "";
  const bodies = ["", "", "", ""];
  let hiCoolD = "";
  let hiMidD = "";
  let hiWarmD = "";
  let creaseD = "";
  let dryTailD = "";

  for (const s of strokes) {
    shadowD += brushShadow(s, margin);
    const pIdx = s.pigment >= 0 && s.pigment < 4 ? s.pigment : 0;
    bodies[pIdx] = `${bodies[pIdx] ?? ""}${brushOutline(s, margin, rng)}`;

    const x0 = s.gx + margin;
    const y0 = s.gy + margin;
    const len = s.horizontal ? s.gw : s.gh;
    const padStart = 0.16 + rng() * 0.08;
    const padEnd = 0.18 + rng() * 0.08;

    if (s.horizontal) {
      const rx0 = x0 + padStart;
      const rx1 = Math.max(rx0 + 0.25, x0 + s.gw - padEnd);
      const ryTop = y0 + 0.22 + rng() * 0.06;
      const ryMid = y0 + 0.48 + (rng() - 0.5) * 0.08;
      const ryBot = y0 + 0.8 + (rng() - 0.5) * 0.05;
      const ridge = `M${f(rx0)} ${f(ryTop)}Q${f((rx0 + rx1) * 0.5)} ${f(ryTop + (rng() - 0.5) * 0.05)} ${f(rx1)} ${f(ryTop)}`;
      if (s.warmGlint) hiWarmD += ridge;
      else hiCoolD += ridge;
      if (len >= 2 || s.finder) {
        hiMidD += `M${f(rx0 + 0.08)} ${f(ryMid)}L${f(rx1 - 0.06)} ${f(ryMid + (rng() - 0.5) * 0.04)}`;
      }
      creaseD += `M${f(rx0 + 0.04)} ${f(ryBot)}L${f(x0 + s.gw - 0.12)} ${f(ryBot)}`;
      if (!s.finder && len >= 3 && rng() < 0.65) {
        const tx1 = x0 + s.gw + 0.03;
        const tx0 = tx1 - (0.2 + rng() * 0.12);
        dryTailD += `M${f(tx0)} ${f(y0 + 0.26)}H${f(tx1)}M${f(tx0 + 0.04)} ${f(y0 + 0.74)}H${f(tx1 - 0.01)}`;
      }
    } else {
      const rxLeft = x0 + 0.22 + rng() * 0.06;
      const rxMid = x0 + 0.48 + (rng() - 0.5) * 0.08;
      const rxRight = x0 + 0.8 + (rng() - 0.5) * 0.05;
      const ry0 = y0 + padStart;
      const ry1 = Math.max(ry0 + 0.25, y0 + s.gh - padEnd);
      const ridge = `M${f(rxLeft)} ${f(ry0)}Q${f(rxLeft + (rng() - 0.5) * 0.05)} ${f((ry0 + ry1) * 0.5)} ${f(rxLeft)} ${f(ry1)}`;
      if (s.warmGlint) hiWarmD += ridge;
      else hiCoolD += ridge;
      if (len >= 2 || s.finder) {
        hiMidD += `M${f(rxMid)} ${f(ry0 + 0.08)}L${f(rxMid + (rng() - 0.5) * 0.04)} ${f(ry1 - 0.06)}`;
      }
      creaseD += `M${f(rxRight)} ${f(ry0 + 0.04)}L${f(rxRight)} ${f(y0 + s.gh - 0.12)}`;
      if (!s.finder && len >= 3 && rng() < 0.65) {
        const ty1 = y0 + s.gh + 0.03;
        const ty0 = ty1 - (0.2 + rng() * 0.12);
        dryTailD += `M${f(x0 + 0.26)} ${f(ty0)}V${f(ty1)}M${f(x0 + 0.74)} ${f(ty0 + 0.04)}V${f(ty1 - 0.01)}`;
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}" width="240" height="240">` +
    `<rect width="${full}" height="${full}" fill="#f5f0e5"/>` +
    `<path d="${weaveD}" fill="none" stroke="#e2d9c5" stroke-width="0.026" opacity="0.18"/>` +
    `<path d="${shadowD}" fill="#c2b69d" opacity="0.42"/>` +
    bodies
      .map((d, i) =>
        d === ""
          ? ""
          : `<path d="${d}" fill="${PAINT_PALETTE[i] ?? PAINT_PALETTE[0]}"/>`,
      )
      .join("") +
    (creaseD === ""
      ? ""
      : `<path d="${creaseD}" fill="none" stroke="#090d11" stroke-width="0.09" stroke-linecap="round" opacity="0.48"/>`) +
    (hiMidD === ""
      ? ""
      : `<path d="${hiMidD}" fill="none" stroke="#2c4352" stroke-width="0.055" stroke-linecap="round" opacity="0.48"/>`) +
    (hiCoolD === ""
      ? ""
      : `<path d="${hiCoolD}" fill="none" stroke="#42596b" stroke-width="0.08" stroke-linecap="round" opacity="0.46"/>`) +
    (hiWarmD === ""
      ? ""
      : `<path d="${hiWarmD}" fill="none" stroke="#7d4a28" stroke-width="0.1" stroke-linecap="round" opacity="0.58"/>`) +
    (dryTailD === ""
      ? ""
      : `<path d="${dryTailD}" fill="none" stroke="#efe8d9" stroke-width="0.055" stroke-linecap="round" opacity="0.45"/>`) +
    `</svg>`
  );
}
