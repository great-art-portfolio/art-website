/** `pnpm seed:gallery`: preview the grid with a full room.
 *
 * Generates tasteful placeholder paintings (soft abstract gradients in the
 * gallery palette — clearly stand-ins, never her work) across varied
 * aspects, prices, and sold states, so the collection grid can be judged
 * with fourteen pieces instead of five. Everything lands untracked under
 * src/content/paintings/, so `pnpm studio:reset` wipes it clean.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const DIR = "src/content/paintings";
const COUNT = 9;

const PIECES = [
  { title: "Harbour Study I", w: 1600, h: 2000, price: 340, sold: false },
  { title: "Thaw", w: 2000, h: 1400, price: 480, sold: false },
  { title: "Late Light on the Bow", w: 1800, h: 1800, price: 620, sold: true },
  { title: "Reeds", w: 1400, h: 2000, price: 295, sold: false },
  { title: "Winter Wheat", w: 2200, h: 1400, price: 540, sold: false },
  { title: "Small Hours", w: 1200, h: 1500, price: 180, sold: true },
  { title: "Riverbend in October", w: 2000, h: 2000, price: 710, sold: false },
  { title: "First Snow, Nose Hill", w: 1500, h: 2000, price: 390, sold: false },
  { title: "Prairie Sky, Wide", w: 2400, h: 1500, price: 660, sold: false },
];

const PALETTES = [
  ["#e8dcc3", "#a44a24", "#5c6e5a"],
  ["#efe6d4", "#7a8a99", "#3f4a5a"],
  ["#e5d5bd", "#b35545", "#756a5c"],
  ["#ece2cc", "#2e6e5e", "#c8b284"],
];

function svgGradient(w, h, stops) {
  const [a, b, c] = stops;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/>` +
      `<stop offset="1" stop-color="${c}"/></linearGradient></defs>` +
      `<rect width="${w}" height="${h}" fill="url(#g)"/></svg>`,
  );
}

async function main() {
  await mkdir(DIR, { recursive: true });
  for (let i = 0; i < COUNT; i += 1) {
    const piece = PIECES[i];
    const slug = `seed-${String(i + 1).padStart(2, "0")}`;
    const palette = PALETTES[i % PALETTES.length];
    await sharp(svgGradient(piece.w, piece.h, palette))
      .jpeg({ quality: 82 })
      .toFile(join(DIR, `${slug}.jpg`));
    const md = [
      "---",
      `title: "${piece.title}"`,
      "dateAdded: 2025-11-02",
      `image: "${slug}.jpg"`,
      `alt: "Seed placeholder — ${piece.title}"`,
      `sold: ${piece.sold}`,
      `price: ${piece.price.toFixed(2)}`,
      `widthIn: ${Math.round(piece.w / 100)}`,
      `heightIn: ${Math.round(piece.h / 100)}`,
      'medium: "Seed placeholder"',
      "---",
      "",
      "Seed placeholder, removed by `pnpm studio:reset`.",
      "",
    ].join("\n");
    await writeFile(join(DIR, `${slug}.md`), md);
    console.log(`seeded ${slug} (${piece.w}x${piece.h})`);
  }
  console.log(`\n${COUNT} seed paintings. Undo with: pnpm studio:reset`);
}

await main();
