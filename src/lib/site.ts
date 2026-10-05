/** Site-wide display settings. */

/** Production domain. The build is static, so it can't come from the
 * request URL. */
export const SITE_URL = "https://barbart.ca";

/** The artist's name. Set to null to fall back to generic wording. */
export const ARTIST_NAME: string | null = "Barbara Straka";

export const ARTIST_LOCATION = "Calgary, Alberta";

/** Show prices on cards and painting pages. */
export const SHOW_PRICES = true;

/** Buyer page share button. Off until it has a placement that works in
 * the crumbs row or meta line. */
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

/** True when another painting already uses this title's slug. ownSlug
 * excludes the painting being edited. */
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

/** "5 works" or "1 work", for section headings. */
export function workCount(n: number): string {
  return `${n} ${n === 1 ? "work" : "works"}`;
}

/** False for drafts and trashed paintings, which buyers don't see. */
export function isPublished(data: {
  draft?: boolean | undefined;
  trash?: boolean | undefined;
}): boolean {
  return data.draft !== true && data.trash !== true;
}

/** Splits rows into available and sold, preserving order. */
export function groupByAvailability<T extends { sold: boolean }>(
  rows: T[],
): { available: T[]; sold: T[] } {
  const available: T[] = [];
  const sold: T[] = [];
  for (const r of rows) (r.sold ? sold : available).push(r);
  return { available, sold };
}

/** Gallery sort: paintings with an order first, then the rest
 * alphabetically. */
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
