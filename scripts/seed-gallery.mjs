/** `pnpm seed:gallery [count]`: fills the gallery with placeholder paintings.
 *
 * Generates abstract landscape placeholders across the sizes she might
 * paint (6 × 6 in up to 48 × 36 in, panoramas, tall ones, one with no
 * size yet), with long and short titles, varied prices, sold states, and
 * spread-out dates, so the grid can be checked at any count. Past the
 * list the pieces repeat with numbered titles. Files are written untracked
 * under src/content/paintings/, and `pnpm studio:reset` removes them.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const DIR = "src/content/paintings";
const COUNT = Number(process.argv[2] ?? 14);

// w × h in inches; null when she hasn't measured it yet.
const PIECES = [
  { title: "Harbour Study I", w: 16, h: 20, price: 340, sold: false },
  { title: "Thaw", w: 20, h: 14, price: 480, sold: false },
  { title: "Late Light on the Bow", w: 18, h: 18, price: 620, sold: true },
  { title: "Reeds", w: 6, h: 6, price: 60, sold: false },
  { title: "Winter Wheat", w: 36, h: 12, price: 540, sold: false },
  { title: "Small Hours", w: 8, h: 10, price: 95, sold: true },
  { title: "Riverbend in October", w: 40, h: 40, price: 2400, sold: false },
  { title: "First Snow, Nose Hill", w: 12, h: 36, price: 390, sold: false },
  { title: "Prairie Sky, Wide", w: 48, h: 24, price: 1650, sold: false },
  {
    title: "The Long Road Home Past the Grain Elevators at Dusk",
    w: 24,
    h: 36,
    price: 980,
    sold: false,
  },
  { title: "Untitled (blue)", w: null, h: null, price: 150, sold: false },
  { title: "Canola", w: 12, h: 12, price: 125, sold: false },
  { title: "Chinook Arch", w: 36, h: 48, price: 3200, sold: false },
  { title: "Kitchen Window", w: 10, h: 8, price: 85, sold: false },
];

const PALETTES = [
  ["#e8dcc3", "#a44a24", "#5c6e5a", "#f3ead8"],
  ["#efe6d4", "#7a8a99", "#3f4a5a", "#d9c7a4"],
  ["#e5d5bd", "#b35545", "#756a5c", "#2d2a26"],
  ["#ece2cc", "#2e6e5e", "#c8b284", "#f5efe3"],
  ["#1f2a3a", "#c2803f", "#5a7088", "#e9dcc0"],
];

/** A sky, a sun, and two hills: reads as a painting in a screenshot. */
function svgLandscape(w, h, palette, seed) {
  const [sky, sun, hill, far] = palette;
  const r = (n) => ((seed * 9301 + n * 49297) % 233280) / 233280;
  const horizon = h * (0.45 + r(1) * 0.2);
  const sunX = w * (0.2 + r(2) * 0.6);
  const sunR = Math.min(w, h) * (0.06 + r(3) * 0.06);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="${far}"/>` +
      `</linearGradient></defs>` +
      `<rect width="${w}" height="${h}" fill="url(#s)"/>` +
      `<circle cx="${sunX}" cy="${horizon * 0.55}" r="${sunR}" fill="${sun}" opacity=".85"/>` +
      `<path d="M0 ${horizon} Q ${w * 0.3} ${horizon - h * 0.12} ${w * 0.6} ${horizon} T ${w} ${horizon - h * 0.05} V ${h} H 0 Z" fill="${far}" opacity=".7"/>` +
      `<path d="M0 ${horizon + h * 0.12} Q ${w * 0.45} ${horizon - h * 0.02} ${w} ${horizon + h * 0.15} V ${h} H 0 Z" fill="${hill}"/>` +
      `</svg>`,
  );
}

function day(i) {
  const d = new Date(Date.UTC(2026, 9, 20));
  d.setUTCDate(d.getUTCDate() - i * 9);
  return d.toISOString().slice(0, 10);
}

async function main() {
  await mkdir(DIR, { recursive: true });
  for (let i = 0; i < COUNT; i += 1) {
    const base = PIECES[i % PIECES.length];
    const round = Math.floor(i / PIECES.length);
    const title = round === 0 ? base.title : `${base.title} ${round + 1}`;
    const slug = `seed-${String(i + 1).padStart(3, "0")}`;
    // Unmeasured pieces get a slightly tall photo.
    const aspect = base.w === null ? 0.8 : base.w / base.h;
    const px =
      aspect >= 1
        ? { w: 1800, h: Math.round(1800 / aspect) }
        : { w: Math.round(1800 * aspect), h: 1800 };
    await sharp(svgLandscape(px.w, px.h, PALETTES[i % PALETTES.length], i + 1))
      .jpeg({ quality: 80 })
      .toFile(join(DIR, `${slug}.jpg`));
    const md = [
      "---",
      `title: "${title}"`,
      `dateAdded: ${day(i)}`,
      `image: "${slug}.jpg"`,
      `alt: "Seed placeholder — ${title}"`,
      `sold: ${base.sold}`,
      `price: ${base.price.toFixed(2)}`,
      ...(base.w === null ? [] : [`widthIn: ${base.w}`, `heightIn: ${base.h}`]),
      'medium: "Acrylic on canvas"',
      "---",
      "",
      "Seed placeholder, removed by `pnpm studio:reset`.",
      "",
    ].join("\n");
    await writeFile(join(DIR, `${slug}.md`), md);
  }
  console.log(`${COUNT} seed paintings. Undo with: pnpm studio:reset`);
}

await main();
