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
/** Photos narrower than this stay normal however large the canvas: the
 * height cap stops a tall one before a wider slot could show it bigger. */
export const TALL_ASPECT = 0.7;

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
    const big =
      typical !== null &&
      area !== null &&
      area >= typical * ratio &&
      item.aspect >= TALL_ASPECT;
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

/** Where a card sits on the desktop 12-column grid: its column span, the
 * column it starts at when it's centered alone, and how far it drops
 * below the row's top (0, 1 = 2.5rem, 2 = 5rem) for the stagger. */
export interface Slot {
  span: number;
  start: number | null;
  lift: 0 | 1 | 2;
}

/** Normal rows repeat this pattern: a large-left pair, a trio with the
 * middle card lowered, a large-right pair, and a trio with the outer
 * cards lowered (7+5, 4+4+4, 5+7, 4+4+4). */
const PATTERN = ["pair-left", "trio-a", "pair-right", "trio-b"] as const;

const slot = (span: number, lift: 0 | 1 | 2 = 0, start: number | null = null) =>
  ({ span, start, lift }) satisfies Slot;

/** Packs the gallery into desktop rows that always fill the width, so a
 * big or wide painting never leaves a hole beside it. Paintings keep their
 * order. Wide and big ones take 8 columns with the next small painting
 * beside them (a big portrait takes the 7 of a 7+5 pair, since its height
 * cap would leave an 8-column slot mostly empty), two of them share a row,
 * and a big wide one takes the whole row. Other paintings follow the
 * stagger pattern, where the larger of a pair gets the larger slot. A
 * short last row fills the width: a lone card is centered at 6 columns. */
export function desktopSlots(
  items: readonly TileInput[],
  tiles: readonly Tile[] = galleryTiles(items),
): Slot[] {
  const slots: Slot[] = [];
  const area = (i: number): number | null => {
    const item = items[i];
    if (item === undefined || item.widthIn === null || item.heightIn === null)
      return null;
    return item.widthIn * item.heightIn;
  };
  // A clear size difference decides which of a pair gets the larger slot.
  const larger = (a: number, b: number): "first" | "second" | null => {
    const x = area(a);
    const y = area(b);
    if (x === null || y === null) return null;
    if (x >= y * 1.5) return "first";
    if (y >= x * 1.5) return "second";
    return null;
  };
  const portrait = (i: number) => (items[i]?.aspect ?? 1) < 1;
  const big = (i: number) => tiles[i] === "big" || tiles[i] === "wide";
  // A big painting with the small one beside it, in DOM order.
  const bigPair = (bigFirst: boolean, bigIndex: number): Slot[] => {
    const [b, s] = portrait(bigIndex) ? [7, 5] : [8, 4];
    return bigFirst ? [slot(b), slot(s, 1)] : [slot(s, 1), slot(b)];
  };
  let row = 0;
  let i = 0;
  while (i < tiles.length) {
    if (tiles[i] === "big-wide") {
      slots.push(slot(12));
      i += 1;
      continue;
    }
    if (big(i)) {
      if (tiles[i + 1] === "normal") {
        slots.push(...bigPair(true, i));
        i += 2;
      } else if (big(i + 1)) {
        slots.push(slot(6), slot(6, 1));
        i += 2;
      } else {
        slots.push(slot(8, 0, 3));
        i += 1;
      }
      continue;
    }
    const kind = PATTERN[row % PATTERN.length] ?? "pair-left";
    const need = kind.startsWith("pair") ? 2 : 3;
    let run = 0;
    while (run < need && tiles[i + run] === "normal") run += 1;
    if (run === need) {
      if (need === 2) {
        const pick = larger(i, i + 1);
        const left = pick === null ? kind === "pair-left" : pick === "first";
        slots.push(...(left ? [slot(7), slot(5, 2)] : [slot(5, 2), slot(7)]));
      } else if (kind === "trio-a") {
        slots.push(slot(4), slot(4, 1), slot(4));
      } else {
        slots.push(slot(4, 1), slot(4), slot(4, 1));
      }
      row += 1;
      i += run;
      continue;
    }
    // The run stopped short, at the end or at a bigger painting.
    const next = i + run;
    if (run === 1 && big(next)) {
      slots.push(...bigPair(false, next));
      i += 2;
    } else if (run === 1) {
      slots.push(slot(6, 0, 4));
      i += 1;
    } else {
      slots.push(slot(6, kind === "trio-b" ? 1 : 0), slot(6));
      row += 1;
      i += 2;
    }
  }
  // The last card has no row below it to drop toward, so it stays level.
  const last = slots.at(-1);
  if (last !== undefined) last.lift = 0;
  return slots;
}

/** How many of the first `limit` paintings to show so the last desktop row
 * is full instead of one painting centered alone, giving up at most two.
 * Returns `limit` when no nearby cut ends a row. */
export function fullRowCount(
  items: readonly TileInput[],
  limit: number,
): number {
  if (items.length <= limit) return items.length;
  for (let n = limit; n >= Math.max(1, limit - 2); n -= 1) {
    // Every row fills the width except a lone last card, which is centered.
    if (desktopSlots(items.slice(0, n)).at(-1)?.start === null) return n;
  }
  return limit;
}
