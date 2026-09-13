/** Typed DOM lookup: known ids come back concrete, so `.value` typechecks
 * with no call-site cast. Dynamic ids fall through to `HTMLElement` —
 * narrow those with `instanceof`, never a cast. */
export interface ElementMap {
  // Studio collection, banner, and guide pages.
  "admin-status": HTMLElement;
  "collection-dev": HTMLElement;
  "collection-refresh": HTMLButtonElement;
  "edit-list": HTMLUListElement;
  "local-collection": HTMLElement;
  "row-confirm": HTMLElement;
  "row-confirm-title": HTMLElement;
  "row-confirm-body": HTMLElement;
  "row-confirm-no": HTMLButtonElement;
  "row-confirm-yes": HTMLButtonElement;
  "practice-reset": HTMLButtonElement;
  // Metrics page (admin/metrics.astro).
  "stats-seed": HTMLElement;
  "stats-body": HTMLElement;
  "stats-note": HTMLElement;
  "stats-total": HTMLElement;
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
  // Studio rooms (PaintingDetail.astro). Id prefixes: `de-` = the
  // draft/edit editor form shared by both studio modes, `pv-` = its live
  // preview column.
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
  "de-publish-on": HTMLInputElement;
  "de-notify-push": HTMLInputElement;
  "de-notify-email": HTMLInputElement;
  "de-status": HTMLElement;
  "de-share": HTMLElement;
  "de-share-hint": HTMLElement;
  "de-share-text": HTMLTextAreaElement;
  "de-share-send": HTMLButtonElement;
  "de-share-photo": HTMLButtonElement;
  "de-share-copy": HTMLButtonElement;
  "de-share-status": HTMLElement;
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
export function maybeButton(id: string): HTMLButtonElement | null {
  const el = document.getElementById(id);
  return el instanceof HTMLButtonElement ? el : null;
}

/** Local preview, where publishing + analytics never live. Not a bug. */
export function isLocalPreview(): boolean {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

/** Studio room mode from `#main data-mode`; null outside the rooms. */
export type StudioMode = "edit" | "draft";

export function studioMode(main: HTMLElement): StudioMode | null {
  const mode = main.dataset.mode;
  return mode === "edit" || mode === "draft" ? mode : null;
}
