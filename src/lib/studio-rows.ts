import { dollarsToCents, formatCAD } from "./money";
import { viewsLabel } from "./views";

/** One dashboard row. Shared static/client renderer, so hydration swaps
 * identical markup (no flash). */
export interface StudioRowInput {
  slug: string;
  title: string;
  price: number;
  image: string;
  mdPath: string;
  /** Drafts link photo + title to the studio room (no buyer page). */
  draft: boolean;
  /** Scheduled go-live ("YYYY-MM-DD", "" when none) — shown on drafts. */
  publishOn: string;
  /** Trashed rows link to the room too (no buyer page) and offer
   * Restore + Delete forever instead of Delete. */
  trash: boolean;
  /** Past-30-day views, 0 when unknown — the span hides itself. */
  views: number;
}

const pencilIcon =
  `<svg class="ico" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">` +
  `<path d="M11.2 2.3l2.5 2.5L6 12.5l-3.4.9.9-3.4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" /></svg>`;
const trashIcon =
  `<svg class="ico" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">` +
  `<path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.8 10h6.4L12 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
const undoIcon =
  `<svg class="ico" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">` +
  `<path d="M6 3.5L2.5 7l3.5 3.5M2.5 7H10a3.5 3.5 0 010 7H7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>`;

export { viewsLabel } from "./views";

export function studioRowHtml(r: StudioRowInput): string {
  const esc = (s: string): string =>
    s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const cents = dollarsToCents(Number(r.price));
  const price = cents === null ? "Price?" : formatCAD(cents);
  // Photo and title are separate links — the buyer page, or the studio
  // room for file-backed drafts and trashed rows (neither has a buyer
  // page; unsaved practice rows keep the buyer target like before).
  // The title never stretches, so empty space beside it stays dead.
  const roomHref = r.mdPath !== "" && (r.draft || r.trash);
  const viewHref = roomHref
    ? `/admin/paintings/${esc(r.slug)}`
    : `/paintings/${esc(r.slug)}`;
  const photo =
    r.image === ""
      ? ""
      : `<a class="row-photo" href="${viewHref}" aria-label="${esc(r.title)}">` +
        `<img class="thumb" src="${esc(r.image)}" alt="" loading="lazy" /></a>`;
  // View counts arrive after the rows (separate fetch) and patch the
  // hook in place — the span hides itself until then, so loading never
  // grows the row or shoves the page.
  const views =
    `<span class="row-views" data-views-for="${esc(r.slug)}">` +
    (r.views > 0 ? ` · ${viewsLabel(r.views)}` : "") +
    `</span>`;
  // Trashed rows offer Restore + Delete forever; everything else
  // offers Edit + Delete (which moves to trash, restorable 30 days).
  // Drafts preview from the room toolbar (one studio door per card —
  // the list itself never says "preview"). Published rows also link
  // their print-ready QR card (a studio page, not a buyer preview).
  const qr =
    !r.trash && !r.draft
      ? `<span class="qr-mini" aria-hidden="true"></span>` +
        `<a class="row-qr" href="/admin/qr-codes#${esc(r.slug)}">QR code</a>`
      : "";
  const actions = r.trash
    ? `<a class="row-edit" href="/admin/paintings/${esc(r.slug)}">${pencilIcon}Edit</a>` +
      `<button type="button" class="row-restore" data-slug="${esc(r.slug)}" data-title="${esc(r.title)}" data-md="${esc(r.mdPath)}">${undoIcon}Restore</button>` +
      `<button type="button" class="row-del" data-purge="1" data-slug="${esc(r.slug)}" data-title="${esc(r.title)}" data-md="${esc(r.mdPath)}">${trashIcon}Delete forever</button>`
    : `<a class="row-edit" href="/admin/paintings/${esc(r.slug)}">${pencilIcon}Edit</a>` +
      qr +
      `<button type="button" class="row-del" data-slug="${esc(r.slug)}" data-title="${esc(r.title)}" data-md="${esc(r.mdPath)}">${trashIcon}Delete</button>`;
  // Scheduled drafts say when they go live, in plain words.
  const schedule =
    !r.trash && r.draft && r.publishOn !== ""
      ? `<span> · goes live ${esc(r.publishOn)}</span>`
      : "";
  return (
    `<li class="row-card">${photo}<span class="row-body">` +
    `<a class="row-title" href="${viewHref}"><strong>${esc(r.title)}</strong></a>` +
    `<span> — ${price}</span>` +
    schedule +
    views +
    `<span class="row-actions">${actions}</span></span></li>`
  );
}
