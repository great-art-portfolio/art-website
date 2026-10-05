/** Responsive image sizes. Update these when the CSS grid changes. */

import type { Tile } from "./gallery-layout";

export const GALLERY_WIDTHS = [400, 700, 1000, 1400];
export const SOLD_WIDTHS = [400, 700];
export const PHOTO_WIDTHS = [640, 960, 1280, 1600];

/** Available cards: two columns, three from 60rem. Wide and big tiles
 * span two columns; big-wide spans the row. The featured painting takes
 * the full row on phones and most of it beside its label on wide screens. */
export function gallerySizes(tile: Tile = "normal"): string {
  if (tile === "featured") return "(min-width: 48rem) 56vw, 92vw";
  if (tile === "big-wide") return "92vw";
  if (tile === "wide" || tile === "big") return "(min-width: 60rem) 62vw, 92vw";
  return "(min-width: 60rem) 30vw, 46vw";
}

/** Sold archive: the same two or three columns, never spanning. */
export function soldSizes(): string {
  return "(min-width: 60rem) 30vw, 46vw";
}

/** Painting detail photo: about 55vw beside the info column, full width
 * on mobile. */
export function photoSizes(): string {
  return "(min-width: 48rem) 55vw, 92vw";
}
