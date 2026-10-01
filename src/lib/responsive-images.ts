/** Responsive image sizes. Update these when the CSS grid changes. */

export const GALLERY_WIDTHS = [400, 700, 1000];
export const SOLD_WIDTHS = [400, 700];
export const PHOTO_WIDTHS = [640, 960, 1280, 1600];

/** Available cards: one column on mobile, two on tablet, then the
 * 12-column grid. */
export function gallerySizes(): string {
  return "(min-width: 60rem) 42vw, (min-width: 40rem) 44vw, 92vw";
}

/** Sold archive: smaller cards in two or three columns. */
export function soldSizes(): string {
  return "(min-width: 60rem) 22vw, (min-width: 40rem) 44vw, 92vw";
}

/** Painting detail photo: about 55vw beside the info column, full width
 * on mobile. */
export function photoSizes(): string {
  return "(min-width: 48rem) 55vw, 92vw";
}
