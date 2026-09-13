/** Site-wide display settings — one place to change how the gallery presents itself. */

/** Live domain. Never derived from the request URL (static build). */
export const SITE_URL = "https://barbart.ca";

/** The artist's name. Set to null to fall back to generic wording. */
export const ARTIST_NAME: string | null = "Barbara Straka";

export const ARTIST_LOCATION = "Calgary, Alberta";

/** One-line description used in the hero and metadata. */
export const TAGLINE = "Nature & abstract originals, painted by hand";

/** Show prices on cards and painting pages (buyers self-qualify). */
export const SHOW_PRICES = true;

/** Buyer page share glyph. Parked: the glyph floated too far from
 * anything in the crumbs row, and the meta line wore it no better.
 * Placement undecided — flip back on when it has a home. */
export const SHOW_PAGE_SHARE = false;

export function artistLabel(): string {
  return ARTIST_NAME ?? "The Studio";
}

export function siteTitle(): string {
  return ARTIST_NAME !== null
    ? `${ARTIST_NAME} — Original Paintings`
    : "Calgary & Abstract Original Paintings";
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

/** True when another painting claims this title's link. ownSlug exempts self. */
export function isTitleTaken(
  taken: Iterable<string>,
  title: string,
  ownSlug: string | null,
): boolean {
  const slug = slugifyTitle(title);
  for (const other of taken) {
    const s = slugifyTitle(other);
    if (s === slug && s !== ownSlug) return true;
  }
  return false;
}

/** "5 works" / "1 work" helper for section headings. */
export function workCount(n: number): string {
  return `${n} ${n === 1 ? "work" : "works"}`;
}

/** Drafts and trash never reach buyers. */
export function isPublished(data: {
  draft?: boolean | undefined;
  trash?: boolean | undefined;
}): boolean {
  return data.draft !== true && data.trash !== true;
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

/** Gallery order: numbered works first, unordered trail alphabetically. */
export function compareGalleryOrder(
  a: { order?: number | null; title: string },
  b: { order?: number | null; title: string },
): number {
  const ao = typeof a.order === "number" ? a.order : null;
  const bo = typeof b.order === "number" ? b.order : null;
  if (ao !== null && bo !== null) {
    return ao !== bo ? ao - bo : a.title.localeCompare(b.title);
  }
  if (ao !== null) return -1;
  if (bo !== null) return 1;
  return a.title.localeCompare(b.title);
}
