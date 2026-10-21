/** Responsive image sizes. Update these when the CSS grid changes.
 *
 * Gallery images are `width: auto` inside their mat, so the browser draws
 * them at the width `sizes` names, capped by the slot. A value below the
 * real slot leaves a wide empty mat beside the painting; one above it only
 * downloads a few more pixels. So each card's sizes is its exact slot.
 *
 * Grid geometry (Gallery.astro, Layout): the grid is the page width minus
 * 48px of side padding, up to 1216px (reached at a 1264px window), with
 * 40px gaps; the sold grid uses 32px gaps. */

import type { Tile } from "./gallery-layout";

export const GALLERY_WIDTHS = [400, 700, 1000, 1400];
export const SOLD_WIDTHS = [400, 700];
export const PHOTO_WIDTHS = [640, 960, 1280, 1600];

const MAX_GRID = 1216;
const WIDEST = "(min-width: 1264px)";
const GAP = 40;

/** Desktop column spans of the repeating 10-card stagger (7+5, 4+4+4,
 * 5+7, 4+4+4), in DOM order. */
export const STAGGER_SPANS = [7, 5, 4, 4, 4, 5, 7, 4, 4, 4] as const;

/** Columns (of 12) a card takes on desktop. Size beats the pattern. Given
 * every card's tile, a short last row fills the width the way Gallery.astro's
 * CSS lays it out: two cards in a trio's slots take 6 each, and a card left
 * alone is centered at 6. Grids with a bigger tile reflow, so it skips them. */
export function cardSpan(
  tile: Tile,
  index: number,
  tiles?: readonly Tile[],
): number {
  if (tile === "big-wide") return 12;
  if (tile === "big" || tile === "wide") return 8;
  if (tiles !== undefined && tiles.every((t) => t === "normal")) {
    const at = index % STAGGER_SPANS.length;
    const last = index === tiles.length - 1;
    const secondLast = index === tiles.length - 2;
    const pair =
      ((at === 2 || at === 7) && secondLast) ||
      ((at === 3 || at === 8) && last);
    const alone = last && (at === 0 || at === 2 || at === 5 || at === 7);
    if (pair || alone) return 6;
  }
  return STAGGER_SPANS[index % STAGGER_SPANS.length] ?? 4;
}

/** Width of a slot spanning `span` of 12 columns in a grid `grid` wide. */
function slot(grid: number, span: number): number {
  return Math.round(((grid - 11 * GAP) / 12) * span + GAP * (span - 1));
}

/** Available cards: one column on phones, two from 40rem (bigger
 * paintings take both), then the 12-column stagger from 60rem. */
export function gallerySizes(
  tile: Tile = "normal",
  index = 0,
  tiles?: readonly Tile[],
): string {
  const span = cardSpan(tile, index, tiles);
  const fraction = (span / 12).toFixed(4);
  const extra = Math.round(GAP * (span - 1) - (11 * GAP * span) / 12);
  const desktop = `calc((100vw - 48px) * ${fraction} ${extra < 0 ? "-" : "+"} ${Math.abs(extra)}px)`;
  const tablet =
    tile === "normal" ? "calc((100vw - 88px) / 2)" : "calc(100vw - 48px)";
  return `${WIDEST} ${slot(MAX_GRID, span)}px, (min-width: 60rem) ${desktop}, (min-width: 40rem) ${tablet}, calc(100vw - 48px)`;
}

/** The newest painting beside the homepage headline: about half the
 * page from 60rem, full width below. */
export function featuredSizes(): string {
  return "(min-width: 76rem) 530px, (min-width: 60rem) 44vw, 92vw";
}

/** Sold archive: two columns, three from 60rem, 32px gaps. */
export function soldSizes(): string {
  return `${WIDEST} ${Math.round((MAX_GRID - 64) / 3)}px, (min-width: 60rem) calc((100vw - 112px) / 3), calc((100vw - 80px) / 2)`;
}

/** Painting detail photo: about 55vw beside the info column from 60rem;
 * stacked below that in a 38rem column, full width on phones. */
export function photoSizes(): string {
  return "(min-width: 76rem) 600px, (min-width: 60rem) 55vw, (min-width: 38rem) 600px, 92vw";
}
