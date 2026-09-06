/**
 * Single source of truth for responsive image widths/sizes.
 * Gallery grid + painting detail must stay in sync: if the CSS grid
 * changes, update the sizes() helpers here — not the .astro markup.
 */

export const GALLERY_WIDTHS = [400, 700, 1000];
export const SOLD_WIDTHS = [400, 700];
export const PHOTO_WIDTHS = [640, 960, 1280, 1600];

/** Available-work cards: 1-col mobile, 2-col tablet, 12-col editorial. */
export function gallerySizes(): string {
  return "(min-width: 60rem) 42vw, (min-width: 40rem) 44vw, 92vw";
}

/** Sold archive: smaller, uniform 2-col / 3-col. */
export function soldSizes(): string {
  return "(min-width: 60rem) 22vw, (min-width: 40rem) 44vw, 92vw";
}

/** Painting detail hero: ~55vw beside sticky info, full-bleed mobile. */
export function photoSizes(): string {
  return "(min-width: 48rem) 55vw, 92vw";
}
