/** Gallery tile sizes. Every painting keeps its shape. A wide one spans
 * two columns, and one much larger than her typical painting gets a
 * double tile, so a 30 × 30 in canvas reads bigger than a 12 × 12 in one.
 * "Typical" is the median area of the paintings shown, so the cutoff
 * follows whatever sizes she paints instead of a fixed number. */
export type Tile = "normal" | "wide" | "big" | "big-wide";

export interface TileInput {
  /** Photo width divided by height. */
  aspect: number;
  widthIn: number | null;
  heightIn: number | null;
}

/** Photos at least this much wider than tall span two columns. */
export const WIDE_ASPECT = 1.6;
/** A painting with at least this multiple of the typical area is big. */
export const BIG_AREA_RATIO = 2;

/** The lower median, so with two paintings the smaller one is typical. */
function typicalArea(areas: readonly number[]): number | null {
  const sorted = [...areas].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? null;
}

export function galleryTiles(items: readonly TileInput[]): Tile[] {
  const areas = items.map((item) =>
    item.widthIn !== null && item.heightIn !== null
      ? item.widthIn * item.heightIn
      : null,
  );
  const typical = typicalArea(areas.filter((a) => a !== null));
  return items.map((item, i) => {
    const area = areas[i] ?? null;
    const wide = item.aspect >= WIDE_ASPECT;
    // A wide tile already spans two columns, so it needs twice the extra
    // area again before it takes the whole row.
    const ratio = wide ? BIG_AREA_RATIO * 2 : BIG_AREA_RATIO;
    const big = typical !== null && area !== null && area >= typical * ratio;
    if (big) return wide ? "big-wide" : "big";
    return wide ? "wide" : "normal";
  });
}

/** The painting hung beside the homepage headline: the most recently
 * added one, so it changes on its own when she adds work. Ties keep the
 * gallery order (the earlier item wins). Returns -1 for an empty list. */
export function pickFeatured(items: readonly { dateAdded: Date }[]): number {
  let best = -1;
  items.forEach((item, i) => {
    const current = items[best];
    if (
      current === undefined ||
      item.dateAdded.getTime() > current.dateAdded.getTime()
    ) {
      best = i;
    }
  });
  return best;
}
