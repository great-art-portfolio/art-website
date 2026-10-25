/** Browsing a large collection in the page: filter chips, Show more, and
 * re-packing the stagger so the visible cards still fill every row. The
 * cards carry their facts as data attributes (Gallery.astro). Plain DOM,
 * loaded with a dynamic import from the gallery's page script. */
import { desktopSlots, galleryTiles, type TileInput } from "./gallery-layout";

const LAYOUT_CLASS = /^(tile|span|start|lift)-/;
const FILTERS = ["size", "shape", "price"] as const;
type Filter = (typeof FILTERS)[number];

const inches = (v: string | undefined): number | null => {
  const n = Number(v);
  return v === undefined || v === "" || !Number.isFinite(n) ? null : n;
};

/** Gives the visible cards of a stagger grid fresh slots, the same way the
 * build lays out the whole collection. */
export function repack(grid: HTMLElement): void {
  const cards = [...grid.children].filter(
    (c): c is HTMLElement =>
      c instanceof HTMLElement && c.classList.contains("card") && !c.hidden,
  );
  const items: TileInput[] = cards.map((c) => ({
    aspect: Number(c.dataset.aspect ?? "1"),
    widthIn: inches(c.dataset.w),
    heightIn: inches(c.dataset.h),
  }));
  const tiles = galleryTiles(items);
  const slots = desktopSlots(items, tiles);
  cards.forEach((card, i) => {
    for (const cls of [...card.classList])
      if (LAYOUT_CLASS.test(cls)) card.classList.remove(cls);
    const tile = tiles[i];
    const slot = slots[i];
    if (tile !== undefined && tile !== "normal")
      card.classList.add(`tile-${tile}`);
    if (slot === undefined) return;
    card.classList.add(`span-${slot.span}`);
    if (slot.start !== null) card.classList.add(`start-${slot.start}`);
    if (slot.lift > 0) card.classList.add(`lift-${slot.lift}`);
  });
}

/** Wires one `[data-browse]` section: its chips (if any), its Show more
 * button (if any), and its count line. Filters start from the address
 * (?size=large) so a link can open a filtered view. */
export function wireBrowse(root: HTMLElement): void {
  if (root.dataset.browseWired === "1") return;
  root.dataset.browseWired = "1";
  const grid = root.querySelector<HTMLElement>("[data-browse-grid]");
  if (grid === null) return;
  const cards = [...grid.querySelectorAll<HTMLElement>(":scope > .card")];
  const step = Number(root.dataset.limit ?? "0");
  const more = root.querySelector<HTMLButtonElement>("[data-show-more]");
  const count = root.querySelector<HTMLElement>("[data-browse-count]");
  const empty = root.querySelector<HTMLElement>("[data-browse-empty]");
  // The build's own count line stays until a filter is on.
  const baseCount = count?.textContent ?? "";
  const params = new URLSearchParams(window.location.search);
  const state: Record<Filter, string> = { size: "", shape: "", price: "" };
  for (const f of FILTERS) {
    const value = params.get(f) ?? "";
    const known = root.querySelector(
      `[data-filter="${f}"] button[data-value="${CSS.escape(value)}"]`,
    );
    if (known !== null) state[f] = value;
  }
  let shown = step > 0 ? step : Infinity;

  const render = (): void => {
    const matches = cards.filter((c) =>
      FILTERS.every((f) => state[f] === "" || c.dataset[f] === state[f]),
    );
    const visible = new Set(matches.slice(0, shown));
    for (const card of cards) card.hidden = !visible.has(card);
    repack(grid);
    for (const f of FILTERS) {
      for (const b of root.querySelectorAll<HTMLButtonElement>(
        `[data-filter="${f}"] button`,
      ))
        b.setAttribute("aria-pressed", String(b.dataset.value === state[f]));
    }
    if (more !== null) {
      const left = matches.length - visible.size;
      more.hidden = left <= 0;
      more.textContent = `Show ${Math.min(left, step)} more`;
    }
    if (count !== null) {
      const filtered = FILTERS.some((f) => state[f] !== "");
      count.textContent = filtered
        ? `${matches.length} of ${cards.length} paintings`
        : baseCount;
    }
    if (empty !== null) empty.hidden = matches.length > 0;
  };

  for (const f of FILTERS) {
    for (const b of root.querySelectorAll<HTMLButtonElement>(
      `[data-filter="${f}"] button`,
    )) {
      b.addEventListener("click", () => {
        state[f] = b.dataset.value ?? "";
        shown = step > 0 ? step : Infinity;
        render();
        const url = new URL(window.location.href);
        if (state[f] === "") url.searchParams.delete(f);
        else url.searchParams.set(f, state[f]);
        history.replaceState(history.state, "", url);
      });
    }
  }
  more?.addEventListener("click", () => {
    const first = cards.find((c) => c.hidden);
    shown += step;
    render();
    // Keep her place: focus the first newly shown painting.
    if (first !== undefined && !first.hidden)
      first.focus({ preventScroll: true });
  });
  render();
}
