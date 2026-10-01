import { api, ApiError, getApiToken, setApiToken } from "../lib/api";
import { $, isLocalPreview, maybe, maybeButton } from "../lib/dom";
import { drawerOpen, wireDrawer, wireDrawers } from "../lib/drawer";
import { errorMessage } from "../lib/errors";
import {
  parseBakedCollection,
  parseBannerPreview,
  type BakedRow,
} from "../lib/schemas";
import { studioRowHtml as rowHtml, viewsLabel } from "../lib/studio-rows";
import {
  compareGalleryOrder,
  groupByAvailability,
  SITE_URL,
  slugifyTitle,
} from "../lib/site";
import { parsePainting, setOrder } from "../lib/painting-edit";
import {
  clearPracticeOverlay,
  loadPracticeOverlay,
  practiceCount,
  practiceDelete,
  practiceUpsert,
  type PracticeOverlay,
} from "../lib/practice";
import {
  isPublishDue,
  paintingFilePaths,
  publishDue,
  setTrash,
  todayKey,
} from "../lib/painting-edit";

/** Studio dashboard: the collection list, banner editor, and gallery ordering.
 * Painting rooms live on their own routes. */

let statusTimer = 0;
/** Shows a toast that dismisses itself. The fade is opacity-only so reduced
 * motion keeps it. One timer drives both phases, so a new message cancels a
 * fade-out in progress. */
function setStatus(msg: string, isError = false, durationMs = 6000): void {
  const el = $("admin-status");
  window.clearTimeout(statusTimer);
  el.classList.remove("toast-out");
  el.textContent = msg;
  el.dataset.tone = isError ? "error" : "ok";
  el.classList.remove("toast-in");
  void el.offsetWidth;
  el.classList.add("toast-in");
  statusTimer = window.setTimeout(() => {
    const live = document.getElementById("admin-status");
    if (live === null) return;
    live.classList.add("toast-out");
    statusTimer = window.setTimeout(() => {
      const gone = document.getElementById("admin-status");
      if (gone === null) return;
      gone.textContent = "";
      gone.classList.remove("toast-in", "toast-out");
    }, 260);
  }, durationMs);
}

/** Restarts the opacity fade-in animation on an element. */
function fadeIn(el: HTMLElement): void {
  el.classList.remove("fade-in");
  void el.offsetWidth;
  el.classList.add("fade-in");
}

/** Unhides an element with a fade. Already-visible elements are left alone. */
function reveal(el: HTMLElement): void {
  if (el.hidden) {
    el.hidden = false;
    fadeIn(el);
  }
}

/** True when saves should go to the localStorage practice overlay. A stored
 * token commits for real, and under `pnpm dev:studio` the local content API
 * writes the working tree without one. */
async function useOverlayMode(): Promise<boolean> {
  if (!isLocalPreview() || getApiToken() !== "") return false;
  return !(await api.localBackend());
}

/** `/api/status` is public, so it doubles as the API-presence probe. */
async function apiReachable(): Promise<boolean> {
  try {
    await api.status();
    return true;
  } catch {
    return false;
  }
}

interface LocalPainting {
  slug: string;
  title: string;
  price: number;
  sold: boolean;
  draft: boolean;
  /** Scheduled go-live ("YYYY-MM-DD", "" when none). */
  publishOn: string;
  /** trashedAt is "YYYY-MM-DD", or "" when never trashed. */
  trash: boolean;
  trashedAt: string;
  image: string;
  alt: string;
  description: string;
  widthIn: string;
  heightIn: string;
  depthIn: string;
  medium: string;
  /** Repo path for live deletes ("" for unsaved practice rows). */
  mdPath: string;
  /** Views over the past 30 days. 0 when unknown, which hides the count. */
  views: number;
  /** Gallery position from `order:` frontmatter. Null until first reordered. */
  order: number | null;
}

/** Collection baked into the page, seeded once per visit. The practice
 * overlay merges over it. */
let localRows: LocalPainting[] | null = null;
/** Built thumbnail URLs by repo file, parsed once from the baked-in list. */
let thumbByMd: Record<string, string> | null = null;

/** Normalizes baked rows for editing. Numeric dimensions become strings. */
function seedLocalRows(raw: BakedRow[]): LocalPainting[] {
  const dim = (v: number | null): string =>
    v !== null && Number.isFinite(v) && v > 0 ? String(v) : "";
  return raw
    .filter((r) => r.title !== "")
    .map((r) => ({
      slug: r.slug,
      title: r.title,
      price: r.price,
      sold: r.sold,
      draft: r.draft,
      publishOn: r.publishOn,
      trash: r.trash,
      trashedAt: r.trashedAt,
      image: r.image,
      alt: r.alt,
      description: r.description,
      widthIn: dim(r.widthIn),
      heightIn: dim(r.heightIn),
      depthIn: dim(r.depthIn),
      // The baked list doesn't include medium.
      medium: "",
      mdPath: r.mdPath,
      views: 0,
      order: r.order,
    }));
}

/** Practice overlay: deletes drop rows, upserts replace or append by slug. */
function mergePractice(
  rows: LocalPainting[],
  overlay: PracticeOverlay,
): LocalPainting[] {
  const gone = new Set(overlay.deletes);
  const kept = rows.filter((r) => !gone.has(r.slug));
  for (const p of Object.values(overlay.upserts)) {
    const at = kept.findIndex((r) => r.slug === p.slug);
    const prev = at >= 0 ? kept[at] : undefined;
    const row: LocalPainting = {
      ...p,
      // Practice rows skip trash — Delete drops them from the overlay.
      trash: false,
      trashedAt: "",
      image: prev?.image ?? "",
      mdPath: prev?.mdPath ?? "",
      views: prev?.views ?? 0,
      order: p.order ?? prev?.order ?? null,
    };
    if (at >= 0) {
      kept[at] = row;
    } else {
      kept.push(row);
    }
  }
  return kept;
}

/** Renders the baked collection merged with the practice overlay, without
 * the API. Returns false when the page has no baked list. */
function renderLocalCollection(): boolean {
  if (localRows === null) {
    const el = document.getElementById("local-collection");
    if (el === null) return false;
    const baked = parseBakedCollection(el.textContent ?? "");
    if (baked === null) return false;
    localRows = seedLocalRows(baked);
    // The static markup already shows these rows. Recording the key keeps
    // the first render from swapping in identical HTML, which flickers photos.
    if (lastRowsKey === null) lastRowsKey = rowsKey(localRows);
  }
  const overlay = loadPracticeOverlay();
  // Practice has no backend to publish to, so due drafts show as live for
  // this visit only.
  const today = todayKey();
  const merged = mergePractice(localRows, overlay).map((r) =>
    r.draft && !r.trash && isPublishDue(r.publishOn, today)
      ? { ...r, draft: false, publishOn: "" }
      : r,
  );
  renderRows(merged);
  // Practice saves stay in this browser. Only local previews reach here.
  reveal($("collection-dev"));
  const reset = $("practice-reset");
  reset.hidden = practiceCount(overlay) === 0;
  if (reset.dataset.wired !== "1") {
    reset.dataset.wired = "1";
    reset.addEventListener("click", () => {
      clearPracticeOverlay();
      setStatus("Practice changes cleared — back to the repo list.");
      renderLocalCollection();
    });
  }
  return true;
}

/** Seeds the rows key from the baked list so an identical API response skips
 * the rebuild, which would flicker every photo. */
function seedRowsKey(): void {
  if (lastRowsKey !== null) return;
  const el = document.getElementById("local-collection");
  if (el === null) return;
  const baked = parseBakedCollection(el.textContent ?? "");
  // If the baked list doesn't parse, the API render rebuilds unconditionally.
  if (baked !== null) lastRowsKey = rowsKey(seedLocalRows(baked));
}

/** Signature of the rendered fields in display order, used to skip renders
 * that would change nothing. */
function rowsKey(rows: LocalPainting[]): string {
  return JSON.stringify(
    [...rows]
      .sort(compareGalleryOrder)
      .map((r) => [
        r.slug,
        r.title,
        r.price,
        r.sold,
        r.draft,
        r.trash,
        r.trashedAt,
        r.image,
        r.mdPath,
        r.order,
      ]),
  );
}

/** Key of what the list currently shows (null until the first render). */
let lastRowsKey: string | null = null;

/** Rows behind the current render, for drag-to-reorder lookups. */
let lastRenderedRows: LocalPainting[] = [];

/** Fills the empty mini-QR placeholders beside each row's QR link. The
 * placeholders are in the row markup and sized by CSS, so filling them
 * doesn't shift layout. If a code fails to build, the plain link remains. */
async function fillRowQrs(list: Element): Promise<void> {
  const empty: Element[] = [];
  for (const el of list.querySelectorAll(".qr-mini:empty")) {
    const actions = el.closest(".row-actions");
    const link = actions?.querySelector(".row-qr");
    const slug = (link?.getAttribute("href") ?? "").split("#")[1] ?? "";
    if (slug === "") continue;
    empty.push(el);
    el.setAttribute("data-slug", slug);
  }
  if (empty.length === 0) return;
  try {
    // Imported lazily because the studio dev server sometimes fails to
    // pre-bundle it, and a top-level import failure would break the panel.
    const { default: qrcode } = await import("qrcode-generator");
    for (const el of empty) {
      const slug = el.getAttribute("data-slug") ?? "";
      const code = qrcode(0, "M");
      code.addData(`${SITE_URL}/paintings/${slug}`);
      code.make();
      el.innerHTML = code.createSvgTag({ cellSize: 2, margin: 0 });
    }
  } catch {
    // Leave the plain link.
  }
}

/** Available sits on top, with Drafts, Sold, and Trash in folds below.
 * Only Available and Sold can be dragged to reorder. */
function renderRows(rows: LocalPainting[]): void {
  const list = $("edit-list");
  $("collection-refresh").hidden = true;
  lastRenderedRows = rows;
  // These are idempotent, so they also cover the server-rendered first paint.
  wireReorder(list);
  wireReorderHint(list);
  wireDrawers(list, "details");
  // Fill QRs before the unchanged-rows early return, or the server-rendered
  // rows would never get theirs.
  void fillRowQrs(list);
  const key = rowsKey(rows);
  if (key === lastRowsKey) return;
  lastRowsKey = key;
  if (rows.length === 0) {
    list.innerHTML =
      '<li class="list-plain">Nothing here yet — tap Add painting above.</li>';
    return;
  }
  // Keep each fold's open state across the swap. A fold mid-animation counts
  // as its target state. New folds use their markup default.
  const foldOpen = new Map<string, boolean>();
  for (const el of list.querySelectorAll("details[data-group]")) {
    if (el instanceof HTMLDetailsElement && el.dataset.group !== undefined) {
      foldOpen.set(el.dataset.group, drawerOpen(el));
    }
  }
  const byTitle = (a: LocalPainting, b: LocalPainting): number =>
    a.title.localeCompare(b.title);
  const live = rows.filter((r) => !r.trash);
  const trashed = [...rows].filter((r) => r.trash).sort(byTitle);
  const drafts = [...live].filter((r) => r.draft).sort(byTitle);
  const groups = groupByAvailability(live.filter((r) => !r.draft));
  const available = [...groups.available].sort(compareGalleryOrder);
  const sold = [...groups.sold].sort(compareGalleryOrder);
  let html =
    `<li class="list-group" data-group="available">` +
    `<ul class="group-rows">` +
    (available.length === 0
      ? `<li class="list-plain">Nothing available right now.</li>`
      : available.map(rowHtml).join("")) +
    `</ul></li>`;
  if (drafts.length > 0) {
    html +=
      `<details class="drafts-fold" data-group="drafts" open>` +
      `<summary>${drafts.length === 1 ? "1 draft" : `${drafts.length} drafts`}</summary>` +
      `<ul class="group-rows">` +
      drafts.map(rowHtml).join("") +
      `</ul></details>`;
  }
  if (sold.length > 0) {
    html +=
      `<details class="sold-fold" data-group="sold" open>` +
      `<summary>${sold.length === 1 ? "1 sold" : `${sold.length} sold`}</summary>` +
      `<ul class="group-rows">` +
      sold.map(rowHtml).join("") +
      `</ul></details>`;
  }
  if (trashed.length > 0) {
    html +=
      `<details class="trash-fold" data-group="trash">` +
      `<summary>${trashed.length === 1 ? "1 trashed" : `${trashed.length} trashed`}</summary>` +
      `<div class="fold-tools">` +
      `<button type="button" class="row-empty">Empty trash</button>` +
      `</div>` +
      `<p class="hint">Anything here over 30 days old clears itself. Deleted forever is forever.</p>` +
      `<ul class="group-rows">` +
      trashed.map(rowHtml).join("") +
      `</ul></details>`;
  }
  list.innerHTML = html;
  void fillRowQrs(list);
  wireReorder(list);
  // Restore fold state without animating, since this is a re-render.
  for (const el of list.querySelectorAll("details[data-group]")) {
    if (!(el instanceof HTMLDetailsElement) || el.dataset.group === undefined)
      continue;
    const keep = foldOpen.get(el.dataset.group);
    if (keep !== undefined) el.open = keep;
    wireDrawer(el);
  }
}

/** Drag-to-reorder within the Available and Sold groups. Delegated listeners
 * attach once; per-card flags are reapplied on every render. */
let reorderWired = false;
let dragSlug: string | null = null;
/** Serializes reorder commits (see the drop handler). */
let reorderQueue: Promise<void> = Promise.resolve();

function reorderCard(target: EventTarget | null): Element | null {
  // Element, not HTMLElement: drops land on SVG icon paths too.
  if (!(target instanceof Element)) return null;
  const card = target.closest(".row-card");
  if (card === null) return null;
  if (
    card.closest('[data-group="available"]') === null &&
    card.closest('[data-group="sold"]') === null
  )
    return null;
  return card;
}

function reorderSlug(card: Element): string | null {
  const slug = card.querySelector(".row-del")?.getAttribute("data-slug");
  return typeof slug === "string" && slug !== "" ? slug : null;
}

function clearDropMarks(list: HTMLElement): void {
  for (const el of list.querySelectorAll(
    ".drop-before, .drop-after, .drop-left, .drop-right",
  )) {
    el.classList.remove("drop-before", "drop-after", "drop-left", "drop-right");
  }
}

type DropMark = "drop-before" | "drop-after" | "drop-left" | "drop-right";

const dropMarks: readonly DropMark[] = [
  "drop-before",
  "drop-after",
  "drop-left",
  "drop-right",
];

/** Insertion point under the pointer. Dragover and drop share it so the
 * highlight matches where the card lands. */
function dropMark(
  card: Element,
  dragged: Element | null,
  clientX: number,
  clientY: number,
): { mark: DropMark; after: boolean } {
  const rect = card.getBoundingClientRect();
  if (
    dragged !== null &&
    Math.abs(dragged.getBoundingClientRect().top - rect.top) < rect.height / 2
  ) {
    const after = (clientX - rect.left) / rect.width > 0.5;
    return { mark: after ? "drop-right" : "drop-left", after };
  }
  const after = (clientY - rect.top) / rect.height > 0.5;
  return { mark: after ? "drop-after" : "drop-before", after };
}

/** The card being dragged, by the in-flight slug (null when unknown). */
function draggedCard(list: HTMLElement, slug: string | null): Element | null {
  if (slug === null) return null;
  return (
    list.querySelector(`.row-del[data-slug="${slug}"]`)?.closest(".row-card") ??
    null
  );
}

function wireReorder(list: HTMLElement): void {
  for (const card of list.querySelectorAll(
    '[data-group="available"] .row-card, [data-group="sold"] .row-card',
  )) {
    if (card instanceof HTMLElement) card.draggable = true;
  }
  if (reorderWired) return;
  reorderWired = true;
  list.addEventListener("dragstart", (e) => {
    const card = reorderCard(e.target);
    const slug = card === null ? null : reorderSlug(card);
    if (card === null || slug === null) {
      e.preventDefault();
      return;
    }
    dragSlug = slug;
    if (e.dataTransfer !== null) {
      e.dataTransfer.effectAllowed = "move";
      try {
        e.dataTransfer.setData("text/plain", slug);
      } catch {
        // Some browsers throw here. The drag still works.
      }
    }
  });
  list.addEventListener("dragover", (e) => {
    const card = reorderCard(e.target);
    if (card === null || dragSlug === null || reorderSlug(card) === dragSlug) {
      return;
    }
    e.preventDefault();
    // CSS can't style the cursor mid-drag. "move" shows a move cursor
    // instead of the default arrow.
    if (e.dataTransfer !== null) e.dataTransfer.dropEffect = "move";
    const { mark } = dropMark(
      card,
      draggedCard(list, dragSlug),
      e.clientX,
      e.clientY,
    );
    for (const m of dropMarks) card.classList.toggle(m, m === mark);
  });
  list.addEventListener("dragleave", (e) => {
    const card = reorderCard(e.target);
    if (card === null) return;
    for (const m of dropMarks) card.classList.remove(m);
  });
  list.addEventListener("drop", (e) => {
    const card = reorderCard(e.target);
    if (card === null || dragSlug === null) return;
    e.preventDefault();
    const rows = card.closest(".group-rows");
    const dragged =
      rows
        ?.querySelector(`.row-del[data-slug="${dragSlug}"]`)
        ?.closest(".row-card") ?? null;
    clearDropMarks(list);
    if (!(dragged instanceof Element) || dragged === card) {
      dragSlug = null;
      return;
    }
    const { after } = dropMark(card, dragged, e.clientX, e.clientY);
    // Dropped in its current position.
    if (
      (!after && dragged.nextElementSibling === card) ||
      (after && card.nextElementSibling === dragged)
    ) {
      dragSlug = null;
      return;
    }
    rows?.insertBefore(dragged, after ? card.nextSibling : card);
    const slug = dragSlug;
    dragSlug = null;
    // Serialize reorder commits. A second drop waits for the first and then
    // recomputes from the live DOM, so overlapping drags don't lose updates.
    reorderQueue = reorderQueue
      .then(() => persistOrder(rows, slug))
      // persistOrder reports its own failures. This catch keeps an unexpected
      // throw from stalling the queue.
      .catch((err: unknown) => setStatus(errorMessage(err), true));
    void reorderQueue;
  });
  list.addEventListener("dragend", () => {
    dragSlug = null;
    clearDropMarks(list);
  });
}

/** Reorder hint tooltip on hover and focus. It has pointer-events off so it
 * doesn't interfere with drags. */
let hintTimer = 0;
const HINT_DELAY_MS = 3000;
const REORDER_HINT =
  "Drag cards to reorder — the orange edge shows where it lands. The homepage follows this order.";

function hintBubble(): HTMLElement {
  let tip = document.getElementById("reorder-tip");
  if (tip === null) {
    tip = document.createElement("div");
    tip.id = "reorder-tip";
    tip.setAttribute("role", "tooltip");
    tip.hidden = true;
    tip.textContent = REORDER_HINT;
    document.body.appendChild(tip);
  }
  return tip;
}

function hideReorderHint(): void {
  window.clearTimeout(hintTimer);
  const tip = document.getElementById("reorder-tip");
  if (tip === null) return;
  tip.hidden = true;
  const labelled = document.querySelector('[aria-describedby="reorder-tip"]');
  labelled?.removeAttribute("aria-describedby");
}

function showReorderHint(anchor: Element): void {
  if (!anchor.isConnected) return;
  const tip = hintBubble();
  const rect = anchor.getBoundingClientRect();
  tip.hidden = false;
  anchor.setAttribute("aria-describedby", "reorder-tip");
  // Below the photo when it fits, clamped horizontally for narrow phones.
  const gap = 8;
  const topBelow = rect.bottom + gap;
  const top =
    topBelow + tip.offsetHeight > window.innerHeight
      ? Math.max(gap, rect.top - tip.offsetHeight - gap)
      : topBelow;
  const left = Math.max(
    gap,
    Math.min(rect.left, window.innerWidth - tip.offsetWidth - gap),
  );
  tip.style.top = `${top}px`;
  tip.style.left = `${left}px`;
}

function hintPhoto(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  const photo = target.closest(".row-photo");
  if (photo === null) return null;
  if (
    photo.closest('[data-group="available"]') === null &&
    photo.closest('[data-group="sold"]') === null
  )
    return null;
  return photo;
}

let hintWired = false;

function wireReorderHint(list: HTMLElement): void {
  if (hintWired) return;
  hintWired = true;
  list.addEventListener("mouseover", (e) => {
    const photo = hintPhoto(e.target);
    if (photo === null) return;
    window.clearTimeout(hintTimer);
    hideReorderHint();
    hintTimer = window.setTimeout(() => showReorderHint(photo), HINT_DELAY_MS);
  });
  list.addEventListener("mouseout", (e) => {
    const photo = hintPhoto(e.target);
    if (photo === null) return;
    const next = e instanceof MouseEvent ? e.relatedTarget : null;
    if (next instanceof Element && photo.contains(next)) return;
    hideReorderHint();
  });
  list.addEventListener("focusin", (e) => {
    const photo = hintPhoto(e.target);
    if (photo === null) return;
    window.clearTimeout(hintTimer);
    hideReorderHint();
    hintTimer = window.setTimeout(() => showReorderHint(photo), HINT_DELAY_MS);
  });
  list.addEventListener("focusout", () => hideReorderHint());
  // The tooltip doesn't track its card, so hide it on scroll, drag, or
  // navigation.
  list.addEventListener("dragstart", () => hideReorderHint());
  list.addEventListener("click", () => hideReorderHint());
  window.addEventListener("scroll", () => hideReorderHint(), true);
}

/** Writes one group's DOM order back as 0..n `order:` frontmatter. */
async function persistOrder(
  rows: Element | null,
  moved: string,
): Promise<void> {
  if (rows === null) return;
  const kind =
    rows.closest('[data-group="sold"]') === null ? "Gallery" : "Sold";
  const slugs: string[] = [];
  for (const card of rows.querySelectorAll(":scope > .row-card")) {
    if (!(card instanceof HTMLElement)) continue;
    const slug = reorderSlug(card);
    if (slug !== null) slugs.push(slug);
  }
  if (!slugs.includes(moved)) return;
  const bySlug = new Map(lastRenderedRows.map((r) => [r.slug, r]));
  try {
    if (await useOverlayMode()) {
      let changed = 0;
      for (const [i, slug] of slugs.entries()) {
        const row = bySlug.get(slug);
        if (row === undefined || row.order === i) continue;
        practiceUpsert({
          slug: row.slug,
          title: row.title,
          price: row.price,
          sold: row.sold,
          alt: row.alt,
          description: row.description,
          widthIn: row.widthIn,
          heightIn: row.heightIn,
          depthIn: row.depthIn,
          medium: row.medium,
          draft: row.draft,
          publishOn: row.publishOn,
          order: i,
        });
        changed += 1;
      }
      if (changed === 0) return;
      renderLocalCollection();
      setStatus(
        `${kind} order kept in this tab — publish it on the live site.`,
      );
      return;
    }
    const files: Array<{ path: string; blob: string }> = [];
    for (const [i, slug] of slugs.entries()) {
      const row = bySlug.get(slug);
      if (row === undefined || row.order === i) continue;
      if (row.mdPath === "") {
        throw new Error("Couldn't find this painting's file.");
      }
      const content = await api.getPaintingFile(row.mdPath);
      if (content === null) {
        throw new Error(`Couldn't load "${row.title}".`);
      }
      files.push({ path: row.mdPath, blob: setOrder(content, i) });
    }
    if (files.length === 0) return;
    setStatus(
      `Saving the ${kind.toLowerCase()} order… (live in a few minutes)`,
    );
    await api.commitFiles("Reorder gallery", files);
    // Update rows locally. Re-reading from the API can briefly return the
    // old order.
    for (const [i, slug] of slugs.entries()) {
      const row = bySlug.get(slug);
      if (row !== undefined) row.order = i;
    }
    renderRows(lastRenderedRows);
    setStatus(`${kind} order saved — live in a few minutes.`);
  } catch (err) {
    setStatus(errorMessage(err), true);
    await refreshCollection().catch(() => undefined);
  }
}

/** Days since a trash stamp, or null when the stamp is missing or malformed.
 * Callers treat null as not expired. */
function trashAgeDays(trashedAt: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trashedAt.trim());
  if (m === null) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

/** Moves a painting to trash, where it can be restored for 30 days. Only
 * emptying or purging the trash deletes files. */
async function trashRow(
  slug: string,
  title: string,
  mdPath: string,
): Promise<void> {
  if (await useOverlayMode()) {
    practiceDelete(slug);
    renderLocalCollection();
    setStatus(`Deleted "${title}" from this tab's practice list.`);
    return;
  }
  if (mdPath === "") throw new Error("Couldn't find this painting's file.");
  setStatus(`Moving "${title}" to trash…`);
  const content = await api.getPaintingFile(mdPath);
  if (content === null) throw new Error("Couldn't load this painting's file.");
  const parsed = parsePainting(content);
  if (parsed === null) throw new Error("Couldn't read this painting's file.");
  await api.commitFiles(`Move to trash: ${parsed.title}`, [
    { path: mdPath, blob: setTrash(content, true, todayKey()) },
  ]);
  await refreshCollection();
  setStatus(`Moved "${parsed.title}" to trash — 30 days to change your mind.`);
}

/** Restores a painting from trash. It's reversible, so there's no modal. */
async function restoreRow(btn: HTMLButtonElement): Promise<void> {
  const title =
    btn.dataset.title === ""
      ? "this painting"
      : (btn.dataset.title ?? "this painting");
  const md = btn.dataset.md ?? "";
  const idle = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Restoring…";
  try {
    if (md === "") throw new Error("Couldn't find this painting's file.");
    setStatus(`Restoring "${title}"…`);
    const content = await api.getPaintingFile(md);
    if (content === null)
      throw new Error("Couldn't load this painting's file.");
    const parsed = parsePainting(content);
    if (parsed === null) throw new Error("Couldn't read this painting's file.");
    await api.commitFiles(`Restore painting: ${parsed.title}`, [
      { path: md, blob: setTrash(content, false, null) },
    ]);
    await refreshCollection();
    setStatus(`Restored "${parsed.title}" — back in the collection.`);
  } catch (err: unknown) {
    btn.disabled = false;
    btn.textContent = idle;
    setStatus(errorMessage(err), true);
  }
}

/** Permanently deletes the file, photo, and models in one commit. */
async function purgeRow(
  slug: string,
  title: string,
  mdPath: string,
): Promise<void> {
  if (await useOverlayMode()) {
    practiceDelete(slug);
    renderLocalCollection();
    setStatus(`Deleted "${title}" from this tab's practice list.`);
    return;
  }
  if (mdPath === "") throw new Error("Couldn't find this painting's file.");
  setStatus(`Deleting "${title}" forever… (gone in a few minutes)`);
  const content = await api.getPaintingFile(mdPath);
  if (content === null) throw new Error("Couldn't load this painting's file.");
  const parsed = parsePainting(content);
  if (parsed === null) throw new Error("Couldn't read this painting's file.");
  await api.deleteFiles(
    `Delete painting: ${parsed.title}`,
    paintingFilePaths(mdPath, parsed),
  );
  await refreshCollection();
  setStatus(`Deleted "${parsed.title}" forever.`);
}

/** Permanently deletes every trashed painting in one commit. */
async function emptyTrash(): Promise<void> {
  const trashed = lastRenderedRows.filter((r) => r.trash);
  if (trashed.length === 0) {
    setStatus("The trash is already empty.");
    return;
  }
  if (await useOverlayMode()) {
    for (const r of trashed) practiceDelete(r.slug);
    renderLocalCollection();
    setStatus(
      `Emptied the trash in this tab — ${trashed.length === 1 ? "1 painting" : `${trashed.length} paintings`}, gone.`,
    );
    return;
  }
  setStatus(
    `Emptying the trash… (${trashed.length === 1 ? "1 painting" : `${trashed.length} paintings`})`,
  );
  const paths: string[] = [];
  for (const r of trashed) {
    if (r.mdPath === "") continue;
    const content = await api.getPaintingFile(r.mdPath);
    if (content === null) continue;
    const parsed = parsePainting(content);
    if (parsed === null) continue;
    paths.push(...paintingFilePaths(r.mdPath, parsed));
  }
  await api.deleteFiles(`Empty trash (${trashed.length} paintings)`, paths);
  await refreshCollection();
  setStatus(
    `Emptied the trash — ${trashed.length === 1 ? "1 painting" : `${trashed.length} paintings`}, gone for good.`,
  );
}

/** Deletes trashed live rows older than 30 days and returns the remaining
 * rows. */
async function purgeOldTrash(rows: LocalPainting[]): Promise<LocalPainting[]> {
  const old = rows.filter(
    (r) => r.trash && (trashAgeDays(r.trashedAt) ?? 0) > 30,
  );
  if (old.length === 0) return rows;
  const paths: string[] = [];
  for (const r of old) {
    if (r.mdPath === "") continue;
    const content = await api.getPaintingFile(r.mdPath);
    if (content === null) continue;
    const parsed = parsePainting(content);
    if (parsed === null) continue;
    paths.push(...paintingFilePaths(r.mdPath, parsed));
  }
  if (paths.length > 0) {
    await api.deleteFiles(`Clear old trash (${old.length} paintings)`, paths);
  }
  const gone = new Set(old.map((r) => r.slug));
  setStatus(
    `Cleared ${old.length === 1 ? "1 painting" : `${old.length} paintings`} trashed over 30 days ago.`,
  );
  return rows.filter((r) => !gone.has(r.slug));
}

/**
 * Publishes scheduled drafts whose date has arrived, in one commit. Each file
 * is re-read first so a stale row can't publish something already live,
 * trashed, or rescheduled. If the commit fails, the drafts stay as they were.
 */
async function publishDueRows(rows: LocalPainting[]): Promise<LocalPainting[]> {
  const today = todayKey();
  const due = rows.filter(
    (r) =>
      r.draft &&
      !r.trash &&
      r.mdPath !== "" &&
      isPublishDue(r.publishOn, today),
  );
  if (due.length === 0) return rows;
  const flipped = new Map<string, string>();
  for (const r of due) {
    const content = await api.getPaintingFile(r.mdPath);
    if (content === null) continue;
    const parsed = parsePainting(content);
    if (parsed === null || !parsed.draft || parsed.trash) continue;
    if (!isPublishDue(parsed.publishOn, today)) continue;
    flipped.set(r.mdPath, publishDue(content));
  }
  if (flipped.size > 0) {
    const names = due
      .filter((r) => flipped.has(r.mdPath))
      .map((r) => `"${r.title}"`)
      .join(", ");
    await api.commitFiles(
      flipped.size === 1
        ? `Publish scheduled painting: ${names}`
        : `Publish ${flipped.size} scheduled paintings: ${names}`,
      [...flipped].map(([path, blob]) => ({ path, blob })),
    );
    setStatus(
      flipped.size === 1
        ? `Published ${names} — live in a few minutes.`
        : `Published ${flipped.size} scheduled paintings — live in a few minutes.`,
    );
  }
  return rows.map((r) =>
    flipped.has(r.mdPath) ? { ...r, draft: false, publishOn: "" } : r,
  );
}

/**
 * Routes destructive row actions through one shared confirmation modal. The
 * confirm button stays disabled for 3.5 seconds, with a countdown, so the
 * warning gets read first. One delegated listener covers every row and fold
 * tool across re-renders.
 */
function wireRowDelete(): void {
  const list = $("edit-list");
  const overlay = maybe("row-confirm");
  const titleEl = maybe("row-confirm-title");
  const body = maybe("row-confirm-body");
  const no = maybeButton("row-confirm-no");
  const yes = maybeButton("row-confirm-yes");
  if (overlay === null || no === null || yes === null) {
    return;
  }
  if (list.dataset.delWired === "1") return;
  list.dataset.delWired = "1";
  let timer: number | null = null;
  let pending: {
    mode: "trash" | "purge" | "empty";
    slug: string;
    title: string;
    md: string;
    btn: HTMLButtonElement;
    busy: string;
    idle: string;
  } | null = null;

  const close = () => {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    pending = null;
    overlay.hidden = true;
  };
  const arm = (
    heading: string,
    bodyText: string,
    confirm: string,
    next: Omit<NonNullable<typeof pending>, "busy" | "idle"> & {
      busy: string;
    },
  ) => {
    pending = { ...next, idle: next.btn.textContent };
    if (titleEl !== null) titleEl.textContent = heading;
    if (body !== null) body.textContent = bodyText;
    overlay.hidden = false;
    yes.disabled = true;
    // Compare against a deadline so a throttled tab still enables on time.
    const end = Date.now() + 3500;
    const tick = () => {
      const left = Math.max(0, end - Date.now());
      if (left <= 0) {
        if (timer !== null) window.clearInterval(timer);
        timer = null;
        yes.disabled = false;
        yes.textContent = confirm;
        return;
      }
      yes.textContent = `${confirm} (${Math.max(1, Math.floor(left / 1000))})`;
    };
    tick();
    timer = window.setInterval(tick, 250);
    no.focus();
  };
  const rowOf = (
    btn: HTMLButtonElement,
  ): Omit<NonNullable<typeof pending>, "mode" | "busy" | "idle"> => {
    const title =
      btn.dataset.title === ""
        ? "this painting"
        : (btn.dataset.title ?? "this painting");
    return {
      slug: btn.dataset.slug ?? "",
      title,
      md: btn.dataset.md ?? "",
      btn,
    };
  };
  const openTrash = (btn: HTMLButtonElement) => {
    const row = rowOf(btn);
    arm(
      "Move to trash?",
      `This removes "${row.title}" from the site. Anything in trash ` +
        `restores in one tap, for 30 days.`,
      "Move to trash",
      { ...row, mode: "trash", busy: "Moving…" },
    );
  };
  const openPurge = (btn: HTMLButtonElement) => {
    const row = rowOf(btn);
    arm(
      "Delete forever?",
      `"${row.title}" and its photo are gone for good. This can't be undone.`,
      "Delete forever",
      { ...row, mode: "purge", busy: "Deleting…" },
    );
  };
  const openEmpty = (btn: HTMLButtonElement) => {
    const n = lastRenderedRows.filter((r) => r.trash).length;
    arm(
      "Empty trash?",
      `${n === 1 ? "1 painting" : `${n} paintings`}, gone for good. ` +
        `This can't be undone.`,
      "Empty trash",
      { slug: "", title: "", md: "", btn, mode: "empty", busy: "Emptying…" },
    );
  };

  list.addEventListener("click", (e) => {
    const t = e.target instanceof Element ? e.target : null;
    const restore = t?.closest(".row-restore");
    if (restore instanceof HTMLButtonElement && !restore.disabled) {
      void restoreRow(restore);
      return;
    }
    const empty = t?.closest(".row-empty");
    if (empty instanceof HTMLButtonElement && !empty.disabled) {
      openEmpty(empty);
      return;
    }
    const del = t?.closest(".row-del");
    if (!(del instanceof HTMLButtonElement) || del.disabled) return;
    if (del.dataset.purge === "1") openPurge(del);
    else openTrash(del);
  });
  no.addEventListener("click", () => {
    const btn = pending?.btn;
    close();
    // Return focus to the row that opened the modal, if it still exists.
    if (btn !== undefined && btn.isConnected) btn.focus();
  });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      const btn = pending?.btn;
      close();
      if (btn !== undefined && btn.isConnected) btn.focus();
      return;
    }
    // Trap Tab between the modal's two buttons.
    if (e.key === "Tab") {
      e.preventDefault();
      (document.activeElement === no ? yes : no).focus();
    }
  });
  yes.addEventListener("click", () => {
    if (yes.disabled || pending === null) return;
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    const { mode, slug, title, md, btn, busy, idle } = pending;
    pending = null;
    overlay.hidden = true;
    btn.disabled = true;
    btn.textContent = busy;
    const done =
      mode === "trash"
        ? trashRow(slug, title, md)
        : mode === "purge"
          ? purgeRow(slug, title, md)
          : emptyTrash();
    void done.catch((err: unknown) => {
      btn.disabled = false;
      btn.textContent = idle;
      setStatus(errorMessage(err), true);
    });
  });
}

async function refreshCollection(): Promise<void> {
  const list = $("edit-list");
  let files: string[];
  try {
    files = (await api.listPaintingFiles()).filter((f) => f.endsWith(".md"));
    $("collection-refresh").hidden = true;
  } catch (err) {
    const retry = $("collection-refresh");
    if (err instanceof ApiError && err.status === 401) {
      list.innerHTML =
        '<li>This needs your API token — enter it on the <a href="/admin/guide">Guide page</a>, then tap Retry.</li>';
      retry.hidden = false;
      return;
    }
    // No publishing backend in local dev. Fall back to the list baked into
    // the page plus practice edits.
    if (isLocalPreview() && renderLocalCollection()) return;
    if (await apiReachable()) {
      // The API is up but the request failed. A bad token was handled above.
      list.innerHTML =
        "<li>Couldn't load the collection — check the connection, then tap Retry.</li>";
      retry.hidden = false;
      return;
    }
    list.innerHTML =
      "<li>Couldn't reach the publishing service — open barbart.ca/admin on the live site, then tap Retry.</li>";
    retry.hidden = false;
    return;
  }
  if (files.length === 0) {
    list.innerHTML =
      '<li class="list-plain">Nothing here yet — tap Add painting above.</li>';
    return;
  }
  // Thumbnails come from the baked list, matched by repo file so renamed
  // paintings keep their photo. Rows without a match show no thumbnail.
  if (thumbByMd === null) {
    thumbByMd = {};
    const el = document.getElementById("local-collection");
    const baked =
      el === null ? null : parseBakedCollection(el.textContent ?? "");
    if (baked !== null) {
      for (const r of baked) {
        thumbByMd[r.mdPath] = r.image;
      }
    }
  }
  // Fetch all files in parallel. Sequential fetches took seconds per visit.
  const contents = await Promise.all(
    files.map(async (f) => ({
      f,
      content: await api.getPaintingFile(`src/content/paintings/${f}`),
    })),
  );
  const rows: LocalPainting[] = [];
  for (const { f, content } of contents) {
    const mdPath = `src/content/paintings/${f}`;
    if (content === null) continue;
    const p = parsePainting(content);
    if (p === null || p.title === "") continue;
    const slug = slugifyTitle(p.title);
    rows.push({
      slug,
      title: p.title,
      price: Number(p.price),
      sold: p.sold,
      draft: p.draft,
      publishOn: p.publishOn,
      trash: p.trash,
      trashedAt: p.trashedAt,
      image: (thumbByMd ?? {})[mdPath] ?? "",
      alt: p.alt,
      description: p.description,
      widthIn: p.widthIn,
      heightIn: p.heightIn,
      depthIn: p.depthIn,
      medium: p.medium,
      mdPath: `src/content/paintings/${f}`,
      views: viewsBySlug[slug] ?? 0,
      order: p.order,
    });
  }
  // Purge trash older than 30 days, then publish due drafts. If the purge
  // fails, show the unpurged rows with an error toast instead of an empty list.
  let live = rows;
  try {
    live = await purgeOldTrash(rows);
  } catch (err: unknown) {
    setStatus(errorMessage(err), true);
  }
  try {
    live = await publishDueRows(live);
  } catch (err: unknown) {
    setStatus(errorMessage(err), true);
  }
  renderRows(live);
}

/**
 * Views over the past 30 days by slug. Counts arrive on a separate fetch
 * after the rows. This cache feeds re-renders, and refreshRowViews patches
 * the counts in place so photos don't flicker.
 */
const viewsBySlug: Record<string, number> = {};

/**
 * Fills view counts into the collection rows. If analytics is unconfigured
 * or unreachable, the rows show no counts.
 */
async function refreshRowViews(): Promise<void> {
  let views: Array<{ slug: string; views: number }>;
  try {
    views = (await api.paintingViews()).views;
  } catch {
    return;
  }
  for (const v of views) {
    if (typeof v.slug === "string" && Number.isFinite(v.views)) {
      viewsBySlug[v.slug] = v.views;
    }
  }
  const list = document.getElementById("edit-list");
  if (list === null) return;
  for (const el of list.querySelectorAll<HTMLElement>("[data-views-for]")) {
    const count = viewsBySlug[el.dataset.viewsFor ?? ""] ?? 0;
    const next = count > 0 ? ` · ${viewsLabel(count)}` : "";
    if (el.textContent !== next) el.textContent = next;
  }
}

/** Shows which offline features this browser supports and whether it's
 * online. */
async function refreshCapabilities(): Promise<void> {
  const sw = "serviceWorker" in navigator ? "on" : "unavailable";
  let sync = "unavailable";
  try {
    const reg = await navigator.serviceWorker.ready;
    // `sync` isn't in the DOM typings. Probing with `in` avoids a cast and
    // reports "unavailable" when it's missing.
    sync = "sync" in reg && reg.sync !== undefined ? "on" : "unavailable";
  } catch {
    // No service worker, so offline mode is unavailable.
  }
  const net = navigator.onLine ? "online" : "offline";
  $("cap-sw").textContent = sw;
  $("cap-sync").textContent = sync;
  $("cap-net").textContent = net;
  window.addEventListener("online", () => {
    $("cap-net").textContent = "online";
  });
  window.addEventListener("offline", () => {
    $("cap-net").textContent = "offline";
  });
}

async function refreshFlags(): Promise<void> {
  try {
    const s = await api.status();
    $("flag-email").textContent = s.email ? "on" : "off";
    $("flag-push").textContent = s.push ? "on" : "off";
    $("flag-social").textContent = s.socialPost ? "on (auto)" : "off";
  } catch {
    // No API here, such as under astro dev. Say so instead of leaving "…".
    for (const id of ["flag-email", "flag-push", "flag-social"]) {
      $(id).textContent = "unavailable in this preview";
    }
  }
}

/** Dev-only banner preview. Without a publishing backend, the banner is kept
 * in this browser's storage and the homepage renders it in place of the
 * baked one. */
const BANNER_PREVIEW_KEY = "studio-banner-preview-v1";

function loadBannerPreview(): { text: string; expires: string | null } | null {
  try {
    const raw = window.localStorage.getItem(BANNER_PREVIEW_KEY);
    if (raw === null) return null;
    const preview = parseBannerPreview(JSON.parse(raw) as unknown);
    if (preview === null || preview.text.trim() === "") return null;
    const expires = preview.expires ?? null;
    return {
      text: preview.text.slice(0, 280),
      expires: expires === "" ? null : expires,
    };
  } catch {
    return null;
  }
}

function storeBannerPreview(text: string, expires: string | null): void {
  try {
    window.localStorage.setItem(
      BANNER_PREVIEW_KEY,
      JSON.stringify({ text, expires }),
    );
  } catch {
    // Storage is unavailable in private mode, so the preview lasts for this
    // page only.
  }
}

function clearBannerPreview(): void {
  try {
    window.localStorage.removeItem(BANNER_PREVIEW_KEY);
  } catch {
    // ignore
  }
}

/** Shows the Remove button only while a banner exists. */
function setBannerRemovable(has: boolean): void {
  $("announce-clear").hidden = !has;
}

function init(): void {
  // This script serves every studio page. Each section below runs only
  // where its markup exists.
  const onCollection = document.getElementById("edit-list") !== null;
  const onBanner = document.getElementById("f-announce") !== null;
  const onGuide = document.getElementById("admin-token") !== null;
  const onEmail = document.getElementById("sec-email") !== null;
  const onPing = document.getElementById("sec-tickle") !== null;
  const onQr = document.getElementById("qr-print") !== null;
  if (!onCollection && !onBanner && !onGuide && !onEmail && !onPing && !onQr)
    return;
  wireTickle();
  wireBroadcast();
  wireEmailPreview();
  // QR codes page. The print CSS lives with the page.
  if (onQr) {
    const printBtn = document.getElementById("qr-print");
    if (printBtn !== null && printBtn.dataset.wired !== "1") {
      printBtn.dataset.wired = "1";
      printBtn.addEventListener("click", () => window.print());
    }
    // Per-card buttons print just their card.
    for (const el of document.querySelectorAll(".qr-print-one")) {
      if (!(el instanceof HTMLButtonElement) || el.dataset.wired === "1")
        continue;
      el.dataset.wired = "1";
      el.addEventListener("click", () => {
        const sec = document.getElementById("sec-qr");
        const card = el.closest(".qr-card");
        if (sec === null || card === null) return;
        sec.classList.add("printing-one");
        card.classList.add("print-this");
        const done = (): void => {
          sec.classList.remove("printing-one");
          card.classList.remove("print-this");
          window.removeEventListener("afterprint", done);
        };
        window.addEventListener("afterprint", done);
        window.print();
      });
    }
  }
  $("leave-admin").addEventListener("click", () => {
    setApiToken("");
    window.location.href = "/";
  });
  // Banner page. Saving and removing commit the announcement file, or
  // update the dev preview locally.
  if (onBanner) {
    // The preview updates as she types. It fades with opacity only, so
    // reduced motion keeps it.
    let previewGen = 0;
    let previewFade: Animation | null = null;
    const syncBannerPreview = (): void => {
      const preview = document.getElementById("banner-preview");
      if (preview === null) return;
      const text = $("f-announce").value.trim().slice(0, 280);
      const gen = ++previewGen;
      // Cancel any running fade so a stale fade-out doesn't dim new text.
      if (previewFade !== null) {
        previewFade.cancel();
        previewFade = null;
      }
      if (text === "") {
        if (preview.hidden) return;
        // Fade the text out before hiding the element. A new keystroke
        // cancels the hide below.
        if (typeof preview.animate === "function") {
          const out = preview.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: 180,
          });
          previewFade = out;
          out.onfinish = () => {
            if (gen !== previewGen) return;
            preview.hidden = true;
            preview.textContent = "";
          };
          return;
        }
        preview.hidden = true;
        preview.textContent = "";
        return;
      }
      const showing = preview.hidden;
      preview.textContent = text;
      preview.hidden = false;
      if (showing && typeof preview.animate === "function") {
        previewFade = preview.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 220,
        });
      }
    };
    $("f-announce").addEventListener("input", () => syncBannerPreview());
    api
      .getBanner()
      .then((raw) => {
        void import("../lib/banner").then((bannerMod) => {
          const banner = bannerMod.parseAnnouncement(raw);
          if (banner.text === "") {
            // No published banner, so load this browser's dev preview.
            const preview =
              isLocalPreview() && getApiToken() === ""
                ? loadBannerPreview()
                : null;
            if (
              preview !== null &&
              !bannerMod.isExpired(preview.expires, bannerMod.localToday())
            ) {
              $("f-announce").value = preview.text;
              syncBannerPreview();
              $("f-duration").value = "";
              const meta = $("announce-meta");
              meta.textContent =
                "Preview kept in this browser — open the homepage to see it.";
              fadeIn(meta);
              setBannerRemovable(true);
              return;
            }
          }
          $("f-announce").value = banner.text;
          syncBannerPreview();
          const meta = $("announce-meta");
          if (banner.text === "") {
            meta.textContent = "No banner showing right now.";
            fadeIn(meta);
            setBannerRemovable(false);
            return;
          }
          setBannerRemovable(true);
          if (banner.expires === null) {
            meta.textContent = "Showing now, with no end date.";
            fadeIn(meta);
            $("f-duration").value = "";
            return;
          }
          const left = bannerMod.daysLeft(banner.expires);
          meta.textContent =
            left < 0
              ? `Ended ${banner.expires} — hidden on the site.`
              : `Showing now, ends ${banner.expires} (${left === 0 ? "last day" : `${left} days left`}).`;
          fadeIn(meta);
          // Preselect the lifetime closest to what's left, so saving
          // without touching the dropdown roughly keeps the end date.
          const select = $("f-duration");
          let best = "";
          let bestGap = Number.POSITIVE_INFINITY;
          for (const opt of ["1", "3", "7", "14"]) {
            const gap = Math.abs(Number(opt) - Math.max(0, left));
            if (gap < bestGap) {
              bestGap = gap;
              best = opt;
            }
          }
          select.value = best;
        });
      })
      .catch(() => {
        // Publishing isn't configured yet. The editor works once it is.
      });

    // Remove saves an empty announcement through the same commit path.
    // Update rejects empty text so clearing only happens through Remove.
    $("announce-clear").addEventListener("click", () => {
      $("f-announce").value = "";
      syncBannerPreview();
      saveBanner(true);
    });

    $("announce-save").addEventListener("click", () => {
      saveBanner(false);
    });

    function saveBanner(allowEmpty: boolean): void {
      const text = $("f-announce").value.trim().slice(0, 280);
      if (text === "" && !allowEmpty) {
        // Short-lived hint.
        setStatus(
          "Write the announcement first — or Remove banner.",
          true,
          3500,
        );
        $("f-announce").focus();
        return;
      }
      const durationRaw = $("f-duration").value;
      setStatus("Publishing banner… (live in a few minutes)");
      void import("../lib/banner").then((bannerMod) => {
        const days = durationRaw === "" ? null : Number(durationRaw);
        const body = bannerMod.formatAnnouncement(
          text,
          days === null || !Number.isFinite(days)
            ? null
            : bannerMod.expiryForDuration(days),
        );
        api
          .commitFiles("Update homepage banner", [
            { path: "src/content/announcement.txt", blob: body },
          ])
          .then(() => {
            clearBannerPreview();
            setBannerRemovable(body !== "");
            setStatus(
              body === ""
                ? "Banner cleared."
                : "Banner updated on the homepage.",
            );
          })
          .catch((err: unknown) => {
            // Dev has no publishing backend, so keep the banner in this
            // browser. With a stored token the commit path runs instead.
            if (isLocalPreview() && getApiToken() === "") {
              const parsed = bannerMod.parseAnnouncement(body);
              if (parsed.text === "") clearBannerPreview();
              else storeBannerPreview(parsed.text, parsed.expires);
              const meta = $("announce-meta");
              meta.textContent =
                parsed.text === ""
                  ? "No banner showing right now."
                  : "Preview kept in this browser — open the homepage to see it.";
              fadeIn(meta);
              setBannerRemovable(parsed.text !== "");
              setStatus(
                parsed.text === ""
                  ? "Banner cleared in this browser."
                  : "Banner preview kept in this browser — open the homepage to see it.",
              );
              return;
            }
            setStatus(errorMessage(err), true);
          });
      });
    }
  }

  // Guide page: API token, backend status, and browser capabilities.
  if (onGuide) {
    // Animate the Advanced drawer in script for consistent easing.
    wireDrawers(document, "#sec-info details");
    const tokenInput = $("admin-token");
    tokenInput.value = getApiToken();
    tokenInput.addEventListener("change", () => {
      setApiToken(tokenInput.value.trim());
      setStatus("Token saved on this device.");
      void refreshFlags();
    });
    void refreshFlags();
    void refreshCapabilities();
  }

  // Collection page. Painting rooms redirect here after saving.
  if (onCollection) {
    $("collection-refresh").addEventListener(
      "click",
      () => void refreshCollection(),
    );
    wireRowDelete();
    // Wire the server-rendered folds now, before the collection fetch
    // resolves. Re-renders wire them again.
    wireDrawers($("edit-list"), "details");

    // A painting room leaves its confirmation toast in session storage.
    try {
      const flash = window.sessionStorage.getItem("studio-flash");
      if (flash !== null) {
        window.sessionStorage.removeItem("studio-flash");
        setStatus(flash);
      }
    } catch {
      // Session storage is unavailable, so skip the toast.
    }

    // Clear any tooltip left from the previous page.
    hideReorderHint();
    seedRowsKey();
    void refreshCollection();
    void refreshRowViews();
  }
}

/** Ping page fields, trimmed. Blanks mean the standard title or note. */
function readTickleTitle(): string {
  const el = document.getElementById("tickle-title");
  return el instanceof HTMLInputElement ? el.value.trim().slice(0, 80) : "";
}

function readTickleLine(): string {
  const el = document.getElementById("tickle-body");
  return el instanceof HTMLInputElement ? el.value.trim().slice(0, 180) : "";
}

function wireTickle(): void {
  // The preview updates as she types. Blank fields show the standard title
  // and note that subscribers would get.
  const syncTicklePreview = (): void => {
    const title = document.getElementById("tickle-preview-title");
    const body = document.getElementById("tickle-preview-body");
    if (title === null || body === null) return;
    title.textContent = readTickleTitle() || "Something new in the gallery";
    const line = readTickleLine();
    body.textContent = line === "" ? "Tap to see it." : line;
  };
  for (const id of ["tickle-title", "tickle-body"]) {
    const fieldEl = document.getElementById(id);
    if (
      fieldEl instanceof HTMLInputElement &&
      fieldEl.dataset.previewWired !== "1"
    ) {
      fieldEl.dataset.previewWired = "1";
      fieldEl.addEventListener("input", syncTicklePreview);
    }
  }
  syncTicklePreview();
  // The device preview is a local notification shown on this browser only,
  // rendered the same way as a real ping. It needs notification permission,
  // and a denied permission is reported instead of failing silently.
  const previewBtn = document.getElementById("tickle-preview-send");
  if (previewBtn instanceof HTMLButtonElement) {
    previewBtn.addEventListener("click", () => {
      const status = document.getElementById("tickle-status");
      if (status === null) return;
      if (!("Notification" in window)) {
        status.textContent =
          "This browser can't show ping previews — the card above still shows the words.";
        fadeIn(status);
        return;
      }
      const line = readTickleLine();
      const heading = readTickleTitle();
      const show = (): void => {
        try {
          const note = new Notification(
            heading === "" ? "Something new in the gallery" : heading,
            {
              body: line === "" ? "Tap to see it." : line,
              icon: "/favicon.png",
              badge: "/favicon.png",
              tag: "gallery-preview",
            },
          );
          // Tapping the preview opens the homepage, like a real ping.
          note.onclick = () => {
            window.open("/", "_blank");
            note.close();
          };
          status.textContent = "Preview sent — look for the ping.";
          fadeIn(status);
        } catch {
          status.textContent =
            "This browser blocked the preview — the card above still shows the words.";
          fadeIn(status);
        }
      };
      if (Notification.permission === "granted") {
        show();
        return;
      }
      if (Notification.permission === "denied") {
        status.textContent =
          "Ping previews are blocked — allow notifications for this site in the browser, then try again.";
        fadeIn(status);
        return;
      }
      void Notification.requestPermission().then((answer) => {
        if (answer === "granted") {
          show();
          return;
        }
        status.textContent =
          "Ping previews need the browser's okay — the card above still shows the words.";
        fadeIn(status);
      });
    });
  }
  // Browser push ping, without email. The button is disabled while sending
  // so a double tap can't send twice. A blank note sends the standard one.
  const tickleBtn = document.getElementById("tickle-send");
  if (tickleBtn instanceof HTMLButtonElement) {
    tickleBtn.addEventListener("click", () => {
      const status = document.getElementById("tickle-status");
      if (status === null) return;
      // Respond immediately while the count loads, and clear the previous
      // result so it isn't mistaken for this one.
      status.textContent = "Pinging…";
      fadeIn(status);
      // Confirm with the subscriber count first, since a ping can't be
      // unsent. Cancelling leaves the status line unchanged.
      void api.pushSubscriberCount().then((total) => {
        const ask =
          total === null
            ? "Couldn't check the list — send the ping anyway?"
            : total > 0
              ? `This will ping ${total} browsers. Are you sure?`
              : "Nobody to ping yet — no browsers subscribed. Send anyway?";
        if (!window.confirm(ask)) {
          status.textContent = "";
          return;
        }
        sendTickle();
      });
    });
    function sendTickle(): void {
      const btn = tickleBtn instanceof HTMLButtonElement ? tickleBtn : null;
      const status = document.getElementById("tickle-status");
      if (btn === null || status === null) return;
      const title = readTickleTitle();
      const line = readTickleLine();
      btn.disabled = true;
      status.textContent = "Pinging…";
      fadeIn(status);
      // One Worker call only reaches about 40 browsers, so large lists are
      // paged by cursor. Counts are summed into one result.
      let cursor: number | undefined;
      let pinged = 0;
      const pingBatch = (): void => {
        const push =
          cursor === undefined
            ? { title, body: line }
            : { title, body: line, cursor };
        api
          .notifyCollectors({ push, email: false })
          .then((r) => {
            pinged += r.sent;
            if (r.nextCursor !== null && r.nextCursor !== undefined) {
              cursor = r.nextCursor;
              status.textContent = `Pinging… ${Math.min(cursor, r.total)} of ${r.total} browsers.`;
              fadeIn(status);
              pingBatch();
              return;
            }
            status.textContent =
              r.total === 0
                ? "Nobody to ping yet — no browsers subscribed."
                : `Pinged ${pinged} of ${r.total} browsers.`;
            fadeIn(status);
            // Keep the button disabled until the last page is sent.
            btn.disabled = false;
          })
          .catch((err: unknown) => {
            // Translate common failures. Others show the raw message.
            if (err instanceof ApiError && err.status === 404) {
              status.textContent =
                "Ping isn't available in this preview — it works on the live site.";
            } else if (err instanceof ApiError && err.status === 429) {
              // The server's cooldown message is already user-facing, so
              // show it without a prefix.
              status.textContent = errorMessage(err);
            } else {
              status.textContent = `Couldn't ping: ${errorMessage(err)}`;
            }
            fadeIn(status);
            btn.disabled = false;
          });
      };
      pingBatch();
    }
  }
}

// Email broadcast to the whole list. The server fans out the send. The
// subscriber count is confirmed first, and cancelling leaves the status
// line unchanged.
function wireBroadcast(): void {
  const btnEl = document.getElementById("email-send");
  const btn = btnEl instanceof HTMLButtonElement ? btnEl : null;
  if (btn === null) return;
  btn.addEventListener("click", () => {
    const status = document.getElementById("email-status");
    if (status === null) return;
    status.textContent = "Sending…";
    fadeIn(status);
    void api.emailSubscriberCount().then((total) => {
      // Ask for confirmation unless the list is known to be empty. A failed
      // count load still asks.
      const question =
        total === null
          ? "Couldn't load the subscriber count — send anyway?"
          : total > 0
            ? `This will email ${total} subscribers. Are you sure?`
            : null;
      if (question !== null && !window.confirm(question)) {
        status.textContent = "";
        return;
      }
      btn.disabled = true;
      api
        .sendCollectorEmail(readEmailCopy())
        .then((r) => {
          if (r.emailTotal === 0) {
            status.textContent =
              "Nobody to email yet — no addresses subscribed.";
          } else if (r.emailed) {
            status.textContent = `Emailed ${r.emailTotal} subscribers.`;
          } else {
            status.textContent =
              "The email list isn't set up yet — try again later.";
          }
          fadeIn(status);
          btn.disabled = false;
        })
        .catch((err: unknown) => {
          status.textContent = `Couldn't email: ${errorMessage(err)}`;
          fadeIn(status);
          btn.disabled = false;
        });
    });
  });
}

// Subject and body for the email send, trimmed. The server substitutes the
// standard text for each blank field and adds the sign-off and unsubscribe.
function readEmailCopy(): { subject: string; body: string } {
  const subjectEl = document.getElementById("email-subject");
  const bodyEl = document.getElementById("email-body");
  const subject =
    subjectEl instanceof HTMLInputElement ? subjectEl.value.trim() : "";
  const body = bodyEl instanceof HTMLTextAreaElement ? bodyEl.value.trim() : "";
  return { subject, body };
}

// The email preview is rendered by the server from the same template as the
// real send. Typing refetches it after a short debounce. A failed load
// leaves the fallback text.
function wireEmailPreview(): void {
  const boxEl = document.getElementById("email-preview");
  if (!(boxEl instanceof HTMLElement)) return;
  const subjectEl = document.getElementById("email-preview-subject");
  const bodyEl = document.getElementById("email-preview-body");
  const fallbackEl = document.getElementById("email-preview-fallback");
  if (
    !(subjectEl instanceof HTMLElement) ||
    !(bodyEl instanceof HTMLElement) ||
    !(fallbackEl instanceof HTMLElement)
  )
    return;
  let timer: number | null = null;
  const paint = (
    preview: { subject: string; text: string; html: string } | null,
  ): void => {
    if (preview === null || !(bodyEl instanceof HTMLIFrameElement)) {
      fallbackEl.hidden = false;
      return;
    }
    subjectEl.textContent = preview.subject;
    // Resend replaces the unsubscribe placeholder at send time, so show a
    // readable stand-in. The iframe is sandboxed from the page.
    bodyEl.srcdoc = preview.html.replace(
      "{{{RESEND_UNSUBSCRIBE_URL}}}",
      "(unsubscribe link added automatically)",
    );
    fallbackEl.hidden = true;
    boxEl.hidden = false;
    fadeIn(boxEl);
  };
  const refresh = (): void => {
    void api.emailPreview(readEmailCopy()).then(paint);
  };
  refresh();
  for (const id of ["email-subject", "email-body"]) {
    const fieldEl = document.getElementById(id);
    const field =
      fieldEl instanceof HTMLInputElement ||
      fieldEl instanceof HTMLTextAreaElement
        ? fieldEl
        : null;
    if (field !== null && field.dataset.previewWired !== "1") {
      field.dataset.previewWired = "1";
      field.addEventListener("input", () => {
        if (timer !== null) window.clearTimeout(timer);
        timer = window.setTimeout(refresh, 300);
      });
    }
  }
}

// ClientRouter swaps pages without re-running this bundle, so init runs on
// astro:page-load, which fires on the first load and every navigation. The
// listener persists across swaps, so it needs no guard.
document.addEventListener("astro:page-load", () => void init());
