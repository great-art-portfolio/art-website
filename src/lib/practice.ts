/**
 * Dev practice overlay: in local previews there is no publishing backend,
 * so studio saves land here (localStorage) instead of git. The dashboard
 * merges the overlay over its baked-in list; a reload of any studio route
 * keeps practicing against the same overlay until it is cleared.
 */

export interface PracticePainting {
  slug: string;
  title: string;
  price: number;
  sold: boolean;
  alt: string;
  description: string;
  widthIn: string;
  heightIn: string;
  depthIn: string;
  medium: string;
  draft: boolean;
}

export interface PracticeOverlay {
  upserts: Record<string, PracticePainting>;
  deletes: string[];
}

const KEY = "studio-practice-v1";

function empty(): PracticeOverlay {
  return { upserts: {}, deletes: [] };
}

export function loadPracticeOverlay(): PracticeOverlay {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return empty();
    const parsed = JSON.parse(raw) as Partial<PracticeOverlay>;
    if (typeof parsed !== "object" || parsed === null) return empty();
    const upserts: Record<string, PracticePainting> = {};
    const src = parsed.upserts;
    if (typeof src === "object" && src !== null) {
      for (const [slug, p] of Object.entries(src)) {
        if (
          typeof p === "object" &&
          p !== null &&
          typeof (p as PracticePainting).title === "string"
        ) {
          upserts[slug] = p as PracticePainting;
        }
      }
    }
    const deletes = Array.isArray(parsed.deletes)
      ? parsed.deletes.filter((d): d is string => typeof d === "string")
      : [];
    return { upserts, deletes };
  } catch {
    return empty();
  }
}

function store(overlay: PracticeOverlay): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(overlay));
  } catch {
    // Private mode or full storage — practicing still works for this page.
  }
}

export function practiceUpsert(p: PracticePainting): void {
  const overlay = loadPracticeOverlay();
  overlay.upserts[p.slug] = p;
  overlay.deletes = overlay.deletes.filter((d) => d !== p.slug);
  store(overlay);
}

export function practiceDelete(slug: string): void {
  const overlay = loadPracticeOverlay();
  delete overlay.upserts[slug];
  if (!overlay.deletes.includes(slug)) overlay.deletes.push(slug);
  store(overlay);
}

export function clearPracticeOverlay(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function practiceCount(overlay: PracticeOverlay): number {
  return Object.keys(overlay.upserts).length + overlay.deletes.length;
}
