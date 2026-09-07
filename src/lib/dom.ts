/**
 * Typed DOM lookup for the admin islands. Both islands used to declare
 * their own generic `$<T>()` and scatter `as HTMLInputElement` (and worse,
 * `as unknown as HTMLSelectElement`) at every call site — each cast a
 * place where renaming an id in markup stays green in the compiler and
 * breaks in the browser.
 *
 * The map below is the single choke point: `getElementById` still returns
 * `HTMLElement | null`, but callers get the concrete element type for a
 * known id, so `.value`, `.checked`, and `.disabled` typecheck with no
 * call-site cast. Dynamic ids (a variable, not a literal) fall through to
 * the `string` overload and come back as `HTMLElement | null` — narrow
 * those with `maybeInput` / `maybeButton`, never a cast.
 */
export interface ElementMap {
  // Dashboard (admin.astro).
  "admin-status": HTMLElement;
  "collection-dev": HTMLElement;
  "collection-refresh": HTMLButtonElement;
  "edit-list": HTMLUListElement;
  "local-collection": HTMLElement;
  "row-confirm": HTMLElement;
  "row-confirm-body": HTMLElement;
  "row-confirm-no": HTMLButtonElement;
  "row-confirm-yes": HTMLButtonElement;
  "practice-reset": HTMLButtonElement;
  "f-announce": HTMLInputElement;
  "f-duration": HTMLSelectElement;
  "announce-save": HTMLButtonElement;
  "announce-clear": HTMLButtonElement;
  "announce-meta": HTMLElement;
  "flag-email": HTMLElement;
  "flag-push": HTMLElement;
  "flag-social": HTMLElement;
  "admin-token": HTMLInputElement;
  "cap-sw": HTMLElement;
  "cap-sync": HTMLElement;
  "cap-net": HTMLElement;
  // Studio rooms (PaintingDetail.astro).
  main: HTMLElement;
  "ar-stage": HTMLElement;
  "de-photo": HTMLInputElement;
  "de-photo-empty": HTMLElement;
  "de-photo-preview": HTMLImageElement;
  "de-photo-tools": HTMLElement;
  "de-rotate-90": HTMLButtonElement;
  "de-rotate-270": HTMLButtonElement;
  "de-photo-meta": HTMLElement;
  "de-replace": HTMLButtonElement;
  "de-replace-file": HTMLInputElement;
  "de-ar-waiting": HTMLElement;
  "pv-title": HTMLElement;
  "pv-price": HTMLElement;
  "pv-meta": HTMLElement;
  "pv-desc": HTMLElement;
  "de-title": HTMLInputElement;
  "de-price": HTMLInputElement;
  "de-w": HTMLInputElement;
  "de-h": HTMLInputElement;
  "de-d": HTMLInputElement;
  "de-medium": HTMLInputElement;
  "de-alt": HTMLInputElement;
  "de-desc": HTMLTextAreaElement;
  "de-save-draft": HTMLButtonElement;
  "de-publish": HTMLButtonElement;
  "de-save": HTMLButtonElement;
  "de-visibility": HTMLButtonElement;
  "de-del": HTMLButtonElement;
  "de-sold": HTMLInputElement;
  "de-notify-push": HTMLInputElement;
  "de-notify-email": HTMLInputElement;
  "de-status": HTMLElement;
  "de-confirm": HTMLElement;
  "de-confirm-body": HTMLElement;
  "de-confirm-no": HTMLButtonElement;
  "de-confirm-yes": HTMLButtonElement;
}

/** Throwing lookup: known ids come back with their concrete type. */
export function $<K extends keyof ElementMap>(id: K): ElementMap[K];
export function $(id: string): HTMLElement;
export function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Missing #${id}`);
  return el;
}

/** Nullable lookup: known ids come back with their concrete type. */
export function maybe<K extends keyof ElementMap>(id: K): ElementMap[K] | null;
export function maybe(id: string): HTMLElement | null;
export function maybe(id: string): HTMLElement | null {
  return document.getElementById(id);
}

/** Nullable lookup narrowed by tag — `instanceof`, never a cast. */
export function maybeInput(id: string): HTMLInputElement | null {
  const el = document.getElementById(id);
  return el instanceof HTMLInputElement ? el : null;
}

/** Nullable lookup narrowed by tag — `instanceof`, never a cast. */
export function maybeButton(id: string): HTMLButtonElement | null {
  const el = document.getElementById(id);
  return el instanceof HTMLButtonElement ? el : null;
}

/** Studio room mode from `#main data-mode`; null outside the rooms. */
export type StudioMode = "edit" | "draft";

export function studioMode(main: HTMLElement): StudioMode | null {
  const mode = main.dataset.mode;
  return mode === "edit" || mode === "draft" ? mode : null;
}
