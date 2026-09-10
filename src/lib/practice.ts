/** Dev practice overlay: local studio saves land in localStorage, not git.
 * The dashboard merges it over the baked list until cleared. */

import { parsePracticeOverlay } from "./schemas";
import type { PracticeOverlay, PracticePainting } from "./schemas";

export type { PracticeOverlay, PracticePainting } from "./schemas";

const KEY = "studio-practice-v1";

function empty(): PracticeOverlay {
  return { upserts: {}, deletes: [] };
}

export function loadPracticeOverlay(): PracticeOverlay {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return empty();
    return parsePracticeOverlay(JSON.parse(raw) as unknown) ?? empty();
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
