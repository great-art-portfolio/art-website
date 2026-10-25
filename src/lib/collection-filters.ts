/** Groups for browsing a large collection: size, shape, and price bands
 * that buyers think in, plus how the homepage splits up once there are
 * too many paintings to show at once. Pure, so node tests load it. */

export type SizeBand = "small" | "medium" | "large";
export type Shape = "square" | "tall" | "wide";
export type PriceBand = "under-200" | "200-500" | "over-500";

/** Homepage layout once the collection is large (see `homeSections`):
 * "a" shows her first paintings and links to the full collection page,
 * "b" splits the homepage into rooms by size, and "c" keeps everything on
 * the homepage behind filters and a Show more button. */
export type HomeLayout = "a" | "b" | "c";

/** Past this many available paintings the homepage stops showing them
 * all at once. */
export const BIG_COLLECTION_FROM = 16;
/** Paintings the homepage shows before "See all" or "Show more". */
export const HOME_LIMIT = 12;
/** Paintings per size room on the homepage (layout "b"). */
export const ROOM_LIMIT = 5;
/** Sold paintings the homepage shows before linking to the rest. */
export const SOLD_LIMIT = 6;

/** By the longer side: up to 12 in is small, up to 24 in medium, larger
 * is large. Null when she hasn't measured it. */
export function sizeBand(
  widthIn: number | null,
  heightIn: number | null,
): SizeBand | null {
  if (widthIn === null || heightIn === null) return null;
  const side = Math.max(widthIn, heightIn);
  if (side <= 12) return "small";
  if (side <= 24) return "medium";
  return "large";
}

/** From the photo's width / height, with a little slack for square-ish
 * canvases photographed slightly off. */
export function shapeOf(aspect: number): Shape {
  if (aspect < 0.92) return "tall";
  if (aspect > 1.08) return "wide";
  return "square";
}

export function priceBand(price: number): PriceBand {
  if (price < 200) return "under-200";
  if (price <= 500) return "200-500";
  return "over-500";
}

export const SIZE_LABELS: Record<SizeBand, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};
export const SIZE_HINTS: Record<SizeBand, string> = {
  small: "Up to 12 in",
  medium: "Up to 24 in",
  large: "Over 24 in",
};
export const SHAPE_LABELS: Record<Shape, string> = {
  square: "Square",
  tall: "Tall",
  wide: "Wide",
};
export const PRICE_LABELS: Record<PriceBand, string> = {
  "under-200": "Under $200",
  "200-500": "$200–500",
  "over-500": "Over $500",
};

/** Room headings for layout "b". */
export const ROOM_TITLES: Record<SizeBand | "other", string> = {
  large: "Large canvases",
  medium: "Medium works",
  small: "Small works",
  other: "More paintings",
};

/** Splits paintings into size rooms, largest first, keeping each room in
 * gallery order. Unmeasured paintings go to a last "other" room. Empty
 * rooms are left out. */
export function sizeRooms<T>(
  items: readonly T[],
  bandOf: (item: T) => SizeBand | null,
): Array<{ key: SizeBand | "other"; items: T[] }> {
  const order = ["large", "medium", "small", "other"] as const;
  const rooms = new Map<SizeBand | "other", T[]>(order.map((k) => [k, []]));
  for (const item of items) rooms.get(bandOf(item) ?? "other")?.push(item);
  return order
    .map((key) => ({ key, items: rooms.get(key) ?? [] }))
    .filter((room) => room.items.length > 0);
}
