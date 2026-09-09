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

/**
 * True when another painting already claims this title's page link. Links
 * key off the title — never the filename — so a second "Prairie Moon"
 * breaks the build no matter what its file is called. ownSlug exempts the
 * painting being renamed (keeping its own title is fine).
 */
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

/** Drafts never reach buyers: gallery, painting pages, and sitemap only
 * ever see entries where the draft flag is absent or false. */
export function isPublished(data: { draft?: boolean | undefined }): boolean {
  return data.draft !== true;
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

/**
 * Gallery order, set by dragging Available rows on /admin and stored per
 * painting in frontmatter (`order:`). Ordered works come first by number;
 * unordered ones trail alphabetically — so a painting published before
 * anyone drags simply lands at the end.
 */
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
