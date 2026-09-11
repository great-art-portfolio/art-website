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

/** Studio dashboard: collection index, banner, gallery ordering. Painting
 * rooms live on their own routes. Access-gated in prod; token backup local. */

/** Toasts clear themselves; each new message restarts the clock. */
let statusTimer = 0;
/** Toast words fade both ways (opacity-only, every motion setting). One timer
 * covers both phases, so a mid-fade message cancels the goodbye. */
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

/** A reveal fades instead of snapping (opacity-only, stays gentle). */
function fadeIn(el: HTMLElement): void {
  el.classList.remove("fade-in");
  void el.offsetWidth;
  el.classList.add("fade-in");
}

/** Unhide with a fade, once — already-visible stays put. */
function reveal(el: HTMLElement): void {
  if (el.hidden) {
    el.hidden = false;
    fadeIn(el);
  }
}

/** Practice overlay unless something real persists: a stored token commits,
 * and under `pnpm dev` the sidecar writes the working tree tokenless. */
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
  /** Trash flag + stamp (trashedAt: "YYYY-MM-DD", "" when never trashed). */
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
  /** Past-30-day views, 0 when unknown — the row hides the count. */
  views: number;
  /** Gallery position (order:), null when never dragged. */
  order: number | null;
}

/** Baked-in list, seeded once per visit (dev practice merges over it). */
let localRows: LocalPainting[] | null = null;
/** Built thumbnail URLs by repo file, parsed once from the baked-in list. */
let thumbByMd: Record<string, string> | null = null;

/** Normalize baked rows for editing: numeric dims become display strings. */
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
      // Baked rows carry no medium (reads absent, as before).
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

/** Baked-in collection merged with the practice overlay. No API needed. */
function renderLocalCollection(): boolean {
  if (localRows === null) {
    const el = document.getElementById("local-collection");
    if (el === null) return false;
    const baked = parseBakedCollection(el.textContent ?? "");
    if (baked === null) return false;
    localRows = seedLocalRows(baked);
    // Static markup already shows these rows — record it so the first render
    // doesn't swap identical HTML (photos would flicker).
    if (lastRowsKey === null) lastRowsKey = rowsKey(localRows);
  }
  const overlay = loadPracticeOverlay();
  // Practice has no backend: due schedules read as live for this visit.
  const today = todayKey();
  const merged = mergePractice(localRows, overlay).map((r) =>
    r.draft && !r.trash && isPublishDue(r.publishOn, today)
      ? { ...r, draft: false, publishOn: "" }
      : r,
  );
  renderRows(merged);
  // Practice mode: studio-room saves land in this browser, cleared in one tap.
  // Local preview only, never the live site.
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

/** Seed the rows key from the baked list so an identical API response skips
 * the rebuild (rebuilding every photo flickers). */
function seedRowsKey(): void {
  if (lastRowsKey !== null) return;
  const el = document.getElementById("local-collection");
  if (el === null) return;
  const baked = parseBakedCollection(el.textContent ?? "");
  // Unparseable — the API render below rebuilds unconditionally.
  if (baked !== null) lastRowsKey = rowsKey(seedLocalRows(baked));
}

/** Render signature (sorted rows, rendered fields): skips no-change renders. */
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

/** Available on top; Drafts, Sold, Trash fold underneath (one list on phones).
 * Available and Sold drag to re-sort; Drafts and Trash never drag. */
/** Rows behind the current render, for drag-to-reorder lookups. */
let lastRenderedRows: LocalPainting[] = [];

/** Mini QR beside each row's QR link — the actual code, scannable at
 * a glance. Placeholders ride the row markup (SSR and client render
 * identically, sized by CSS so nothing shoves); this fills the empty
 * ones after every render. Failures keep the plain link. */
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
    // Loaded late and alone: in the studio dev server this dependency
    // sometimes fails to pre-bundle, and a top-level import would take
    // the whole panel down with it (every preview, every row action).
    const { default: qrcode } = await import("qrcode-generator");
    for (const el of empty) {
      const slug = el.getAttribute("data-slug") ?? "";
      const code = qrcode(0, "M");
      code.addData(`${SITE_URL}/paintings/${slug}`);
      code.make();
      el.innerHTML = code.createSvgTag({ cellSize: 2, margin: 0 });
    }
  } catch {
    // A code that won't build leaves the link standing alone.
  }
}

function renderRows(rows: LocalPainting[]): void {
  const list = $("edit-list");
  $("collection-refresh").hidden = true;
  lastRenderedRows = rows;
  // Delegated + idempotent, joining the SSR first paint too.
  wireReorder(list);
  wireReorderHint(list);
  // Folds wire here and again after swaps; wiring is idempotent.
  wireDrawers(list, "details");
  // Mini QRs fill here — before the identical-rows early return below,
  // which otherwise keeps SSR first paint mini-less forever. Idempotent:
  // filled placeholders are skipped, kept ones persist.
  void fillRowQrs(list);
  const key = rowsKey(rows);
  if (key === lastRowsKey) return;
  lastRowsKey = key;
  if (rows.length === 0) {
    list.innerHTML =
      '<li class="list-plain">Nothing here yet — tap Add painting above.</li>';
    return;
  }
  // Carry each fold's effective state across the swap (mid-flight counts
  // as its target); fresh folds keep their markup default.
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
  // Wire the fresh folds, restoring open state instantly (a re-render
  // never animates).
  for (const el of list.querySelectorAll("details[data-group]")) {
    if (!(el instanceof HTMLDetailsElement) || el.dataset.group === undefined)
      continue;
    const keep = foldOpen.get(el.dataset.group);
    if (keep !== undefined) el.open = keep;
    wireDrawer(el);
  }
}

/** Drag-to-reorder within Available/Sold groups. Listeners attach once (event
 * delegation); per-card flags re-apply every render. */
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

/** Insertion point follows the pointer (shared by dragover and drop, so the
 * highlight never lies about the landing). */
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
        // Some browsers need the try; the drag still works.
      }
    }
  });
  list.addEventListener("dragover", (e) => {
    const card = reorderCard(e.target);
    if (card === null || dragSlug === null || reorderSlug(card) === dragSlug) {
      return;
    }
    e.preventDefault();
    // The OS owns the mid-drag pointer (CSS can't reach it) — "move"
    // keeps a meaningful cursor instead of the default arrow.
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
    // Dropping where it already sits changes nothing — stay silent.
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
    // One reorder commit at a time: a second drop waits for the first,
    // then recomputes from the live DOM — overlapping drags used to read
    // stale rows and lose updates.
    reorderQueue = reorderQueue
      .then(() => persistOrder(rows, slug))
      // persistOrder reports its own failures; this only keeps a surprise
      // throw from stalling every later drop, and surfaces it as a toast.
      .catch((err: unknown) => setStatus(errorMessage(err), true));
    void reorderQueue;
  });
  list.addEventListener("dragend", () => {
    dragSlug = null;
    clearDropMarks(list);
  });
}

/** Reorder hint tooltip (hover + focus). Pointer-events off, never disturbs drags. */
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
  // Below the photo when it fits, clamped sideways for narrow phones.
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
  // Bubbles never follow cards: hide on scroll, drag, or navigation.
  list.addEventListener("dragstart", () => hideReorderHint());
  list.addEventListener("click", () => hideReorderHint());
  window.addEventListener("scroll", () => hideReorderHint(), true);
}

/** Write one group's DOM order back as 0..n `order:` frontmatter. */
async function persistOrder(
  rows: Element | null,
  moved: string,
): Promise<void> {
  if (rows === null) return;
  // Whose order just moved, in plain words for the toast.
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
      // Nothing moved — silence, not a toast.
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
    // Screen already matches the repo — nothing to announce.
    if (files.length === 0) return;
    setStatus(
      `Saving the ${kind.toLowerCase()} order… (live in a few minutes)`,
    );
    await api.commitFiles("Reorder gallery", files);
    // Stamp the pushed indices onto the rows (a re-read can flash stale order).
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

/** Row delete after the confirmation modal (practice rows vanish locally). */
/** Days since a stamp. Garbled/absent reads as just-now, never expired. */
function trashAgeDays(trashedAt: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trashedAt.trim());
  if (m === null) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

/** Delete moves to trash (restorable 30 days); only Empty/Purge destroy. */
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

/** One tap back out of trash — harmless and reversible, so no modal. */
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

/** Delete forever: the file, photo, and models, all in one commit. */
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

/** Empty trash: every trashed painting destroyed in one commit. */
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

/** Auto-empty trash older than 30 days (live rows only). Returns survivors. */
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
 * Scheduled drafts whose day has come go live on this visit, in one
 * commit — the mirror of the trash auto-clear above. Each file is
 * re-read first: a stale row never publishes something already live,
 * trashed, or rescheduled. A commit failure keeps the drafts with an
 * error toast, never a half-flipped list.
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
 * Destructive row actions behind one shared confirmation modal — the row
 * button never works double duty. The confirm stays disabled for 3.5
 * seconds so the words get read first; a countdown on the button says
 * why it won't press yet. Restore skips the modal (harmless and
 * reversible). One delegated listener covers every row and fold tool,
 * including re-renders.
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
    // Deadline-based: a stalled tab still arms ~3.5s in.
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
    // Focus the asking row, unless it re-rendered away.
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
    // Tab cycles between the modal's two buttons.
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
    // No publishing backend here (dev): fall back to the list baked into
    // the page — rows, links, and practice edits, all local.
    if (isLocalPreview() && renderLocalCollection()) return;
    if (await apiReachable()) {
      // Server problem (bad token is handled above) — offer Retry.
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
  // Thumbnails come from the baked-in list, matched by repo file (renames
  // keep their photo). Missing ones simply unshown.
  if (thumbByMd === null) {
    thumbByMd = {};
    const el = document.getElementById("local-collection");
    // No thumbnails — rows still render with links and prices.
    const baked =
      el === null ? null : parseBakedCollection(el.textContent ?? "");
    if (baked !== null) {
      for (const r of baked) {
        thumbByMd[r.mdPath] = r.image;
      }
    }
  }
  // One round trip per file, all at once (order preserved) — the old
  // sequential loop kept the dashboard loading for seconds per visit.
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
  // Anything trashed over 30 days ago clears itself on this visit — but
  // a purge failure must never blank the list, so it falls back to the
  // unpurged rows with an error toast. Scheduled drafts whose day has
  // come go live the same way, right after.
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
 * Past-30-day views by slug. Counts arrive on their own fetch, after the
 * rows — the cache feeds re-renders, and the patch below fills the hooks
 * in place (never a rebuild, so photos never flicker).
 */
const viewsBySlug: Record<string, number> = {};

/**
 * View counts live inside the collection rows now — no card, no retry,
 * no notes. Anything less than real data (unconfigured, down, dev)
 * simply leaves the rows count-less.
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

/** Tell her what this browser can do (Safari vs Chrome, online vs offline). */
async function refreshCapabilities(): Promise<void> {
  const sw = "serviceWorker" in navigator ? "on" : "unavailable";
  let sync = "unavailable";
  try {
    const reg = await navigator.serviceWorker.ready;
    // Background Sync rides an undocumented member — probe it with `in`,
    // never a cast, so a missing API reads "unavailable", not a crash.
    sync = "sync" in reg && reg.sync !== undefined ? "on" : "unavailable";
  } catch {
    // No service worker — offline mode unavailable.
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
    // No API here (e.g. astro dev) — say so instead of leaving "…" dots.
    for (const id of ["flag-email", "flag-push", "flag-social"]) {
      $(id).textContent = "unavailable in this preview";
    }
  }
}

/** Dev-only banner preview: no publishing backend here, so the studio
 * keeps the banner in this browser and the homepage renders it on top of
 * (or instead of) the baked one. Never leaves the device. */
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
    // Private mode — the preview only lasts for this page.
  }
}

function clearBannerPreview(): void {
  try {
    window.localStorage.removeItem(BANNER_PREVIEW_KEY);
  } catch {
    // ignore
  }
}

/** Remove only offers itself while a banner exists to remove. */
function setBannerRemovable(has: boolean): void {
  $("announce-clear").hidden = !has;
}

function init(): void {
  // One island serves every studio page — each section below runs only
  // where its markup exists, so the banner page never touches the
  // collection list and vice versa. (Indentation inside the blocks is
  // normalized by Prettier, not by hand.)
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
  // QR codes page: the button prints the cut-out cards (paper CSS lives
  // with the page — here is only the click).
  if (onQr) {
    const printBtn = document.getElementById("qr-print");
    if (printBtn !== null && printBtn.dataset.wired !== "1") {
      printBtn.dataset.wired = "1";
      printBtn.addEventListener("click", () => window.print());
    }
    // Per-card buttons print just their card (see the page's paper CSS).
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
  // Banner page: load the published wording into the form; saving and
  // removing commit the announcement file (or a dev preview).
  if (onBanner) {
    // The preview wears the wording live — what she types is what
    // buyers see, before anything is published. Opacity-only, like the
    // status lines, so every motion setting gets the same gentle fade.
    let previewGen = 0;
    let previewFade: Animation | null = null;
    const syncBannerPreview = (): void => {
      const preview = document.getElementById("banner-preview");
      if (preview === null) return;
      const text = $("f-announce").value.trim().slice(0, 280);
      const gen = ++previewGen;
      // A fresh keystroke retires any fade still playing, so a stale
      // fade-out never dims new words (cancelling snaps back to full).
      if (previewFade !== null) {
        previewFade.cancel();
        previewFade = null;
      }
      if (text === "") {
        if (preview.hidden) return;
        // Words fade out first; layout leaves after arrival. A fresh
        // keystroke invalidates the hiding below.
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
            // No published banner: a dev preview from this browser stands
            // in, so the wording can be tried on the homepage for real.
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
        // Publishing not configured yet — the editor still works once it is.
      });

    // Removing is saving empty: the same commit clears the file (or the
    // dev preview), with the same confirmation words. Updating refuses an
    // empty announcement — clearing is Remove's job, with its own words.
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
        // A nudge, not news: gone quickly.
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
            // Dev has no publishing backend: keep the banner in this
            // browser instead, so the wording can still be tried on the
            // homepage for real. A stored token means the commit, so this
            // path only runs while practicing.
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

  // Guide page: API token, backend flags, and what this browser can do.
  if (onGuide) {
    // The Advanced drawer eases through script on every browser.
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

  // Collection page: rows, drag-to-reorder, deletes, practice overlay.
  // Saves from the painting rooms land back here with a confirmation.
  if (onCollection) {
    $("collection-refresh").addEventListener(
      "click",
      () => void refreshCollection(),
    );
    wireRowDelete();
    // SSR folds animate from the first paint — the collection fetch
    // hasn't resolved yet, and re-renders re-wire anyway.
    wireDrawers($("edit-list"), "details");

    // Landing here from a painting room: its confirmation toast rides
    // along in session storage.
    try {
      const flash = window.sessionStorage.getItem("studio-flash");
      if (flash !== null) {
        window.sessionStorage.removeItem("studio-flash");
        setStatus(flash);
      }
    } catch {
      // Browsers without session storage just miss the handoff.
    }

    // A tooltip from the last visit must not linger on the new page.
    hideReorderHint();
    seedRowsKey();
    void refreshCollection();
    void refreshRowViews();
  }
}

// Ping page (and anywhere else the sections land): the browser
// ping. Runs only where its markup exists, so pages never touch each
// other's sections.
/** Ping page fields, trimmed. Blanks mean the standard title/note. */
function readTickleTitle(): string {
  const el = document.getElementById("tickle-title");
  return el instanceof HTMLInputElement ? el.value.trim().slice(0, 80) : "";
}

function readTickleLine(): string {
  const el = document.getElementById("tickle-body");
  return el instanceof HTMLInputElement ? el.value.trim().slice(0, 180) : "";
}

function wireTickle(): void {
  // The preview wears the notification shape live — blanks show the
  // standard title and note, exactly what buyers get.
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
  // A device preview is a local notification, not a broadcast: it goes
  // through the same system renderer as a real ping, on this browser
  // only. Needs the browser's blessing first; a blocked blessing says
  // so in plain words instead of failing quietly.
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
  // Standalone browser ping (no email). Disabled mid-flight so a double
  // tap can't fan out twice. A custom line rides along — blank means
  // the standard note.
  const tickleBtn = document.getElementById("tickle-send");
  if (tickleBtn instanceof HTMLButtonElement) {
    tickleBtn.addEventListener("click", () => {
      const status = document.getElementById("tickle-status");
      if (status === null) return;
      // Answer every tap at once: the count loads behind this, and the
      // next result can never be mistaken for this tap's leftover text.
      status.textContent = "Pinging…";
      fadeIn(status);
      // Name the reach up front — a ping can't be unsent. The empty
      // result always comes after this question, never before it.
      // A cancelled ask leaves the line as it found it.
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
      // Big lists walk cursor by cursor — one Worker call only pings
      // ~40 browsers. The counts add up; the screen shows one result.
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
            // The button stays off until the last batch lands, so a
            // second tap can't start a second loop mid-walk.
            btn.disabled = false;
          })
          .catch((err: unknown) => {
            // Name the common failures; anything else keeps the raw words.
            if (err instanceof ApiError && err.status === 404) {
              status.textContent =
                "Ping isn't available in this preview — it works on the live site.";
            } else if (err instanceof ApiError && err.status === 429) {
              // The server's own words, already plain (seconds in dev,
              // minutes live) — no "Couldn't ping" prefix needed.
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

// Email broadcast to the whole list, one shot — the server fans out.
// Count first, ask once (an email can't be unsent either); a cancelled
// ask leaves the line as it found it. Runs only where its markup exists.
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
      // An email can't be unsent: always ask when someone's listening,
      // and ask anyway when the count didn't load rather than sending
      // blind. Only an empty list skips the question.
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

// Her subject and body for the Email send, trimmed. Blanks send the
// standard note (the server falls back field-by-field); the sign-off
// and unsubscribe never pass through here.
function readEmailCopy(): { subject: string; body: string } {
  const subjectEl = document.getElementById("email-subject");
  const bodyEl = document.getElementById("email-body");
  const subject =
    subjectEl instanceof HTMLInputElement ? subjectEl.value.trim() : "";
  const body = bodyEl instanceof HTMLTextAreaElement ? bodyEl.value.trim() : "";
  return { subject, body };
}

// The Email preview shows the exact email a send delivers — the
// server composes both from one template, so they can't drift. Typing
// in either field refetches (briefly held, so fast typing sends one read).
// Runs only where its markup exists; a missed load leaves the fallback.
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
  const paint = (preview: { subject: string; text: string } | null): void => {
    if (preview === null) {
      fallbackEl.hidden = false;
      return;
    }
    subjectEl.textContent = preview.subject;
    // Resend swaps the placeholder for a real link at send time — say
    // so in plain words instead of showing the raw curly braces.
    bodyEl.textContent = preview.text.replace(
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
  // Either field repaints the preview as she types.
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

// ClientRouter swaps studio pages without a full load — and skips
// re-running this bundle (same src), so DOMContentLoaded init leaves every
// later visit dead. astro:page-load fires on first load AND every visit;
// its document persists, so one listener covers all visits with no guard.
document.addEventListener("astro:page-load", () => void init());
