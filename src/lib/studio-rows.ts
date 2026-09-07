import { dollarsToCents, formatCAD } from "./money";

/**
 * One dashboard collection row. Shared by the static rows in admin.astro
 * and the client renders in AdminPanel.ts — one renderer means hydration
 * always swaps identical markup (no flash, no layout shift).
 */
export interface StudioRowInput {
  slug: string;
  title: string;
  price: number;
  image: string;
  mdPath: string;
  /** Past-30-day views, 0 when unknown — the span hides itself. */
  views: number;
}

const pencilIcon =
  `<svg class="ico" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">` +
  `<path d="M11.2 2.3l2.5 2.5L6 12.5l-3.4.9.9-3.4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" /></svg>`;
const trashIcon =
  `<svg class="ico" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">` +
  `<path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.8 10h6.4L12 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>`;

/** Row view counts in words — shared by the renderer and the patch. */
export function viewsLabel(n: number): string {
  return n === 1 ? "1 view" : `${n} views`;
}

export function studioRowHtml(r: StudioRowInput): string {
  const esc = (s: string): string =>
    s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const cents = dollarsToCents(Number(r.price));
  const price = cents === null ? "Price?" : formatCAD(cents);
  // Photo and title are separate links to the buyer page — the title
  // never stretches, so empty space beside it stays dead.
  const photo =
    r.image === ""
      ? ""
      : `<a class="row-photo" href="/paintings/${esc(r.slug)}" aria-label="${esc(r.title)}">` +
        `<img class="thumb" src="${esc(r.image)}" alt="" loading="lazy" /></a>`;
  // View counts arrive after the rows (separate fetch) and patch the
  // hook in place — the span hides itself until then, so loading never
  // grows the row or shoves the page.
  const views =
    `<span class="row-views" data-views-for="${esc(r.slug)}">` +
    (r.views > 0 ? ` · ${viewsLabel(r.views)}` : "") +
    `</span>`;
  return (
    `<li class="row-card">${photo}<span class="row-body">` +
    `<a class="row-title" href="/paintings/${esc(r.slug)}"><strong>${esc(r.title)}</strong></a>` +
    `<span> — ${price}</span>` +
    views +
    `<span class="row-actions">` +
    `<a class="row-edit" href="/admin/paintings/${esc(r.slug)}">${pencilIcon}Edit</a>` +
    `<button type="button" class="row-del" data-slug="${esc(r.slug)}" data-title="${esc(r.title)}" data-md="${esc(r.mdPath)}">${trashIcon}Delete</button>` +
    `</span></span></li>`
  );
}
