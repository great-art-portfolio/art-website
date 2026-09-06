/** Site-wide display settings — one place to change how the gallery presents itself. */

/** The artist's name. Set to null to fall back to generic wording. */
export const ARTIST_NAME: string | null = "Barbara Straka";

export const ARTIST_LOCATION = "Calgary, Alberta";

/** One-line description used in the hero and metadata. */
export const TAGLINE = "Nature & abstract originals, painted by hand";

/**
 * Whether prices are shown on cards and painting pages.
 * true  → "$250.00 CAD" beside each available work (recommended: removes
 *          friction, buyers self-qualify, more inquiries convert).
 * false → prices stay private; visitors use the inquiry form to ask.
 */
export const SHOW_PRICES = true;

export function artistLabel(): string {
  return ARTIST_NAME ?? "The Studio";
}

export function siteTitle(): string {
  return ARTIST_NAME !== null ? `${ARTIST_NAME} — Original Paintings` : "Calgary & Abstract Original Paintings";
}

/** URL slug from a painting title: "Night Reeds" → "night-reeds". */
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "5 works" / "1 work" helper for section headings. */
export function workCount(n: number): string {
  return `${n} ${n === 1 ? "work" : "works"}`;
}

/** Studio collection groups: available first, then sold. Order kept. */
export function groupByAvailability<T extends { sold: boolean }>(
  rows: T[],
): { available: T[]; sold: T[] } {
  const available: T[] = [];
  const sold: T[] = [];
  for (const r of rows) (r.sold ? sold : available).push(r);
  return { available, sold };
}
