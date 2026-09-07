import { api, ApiError, getApiToken, setApiToken } from "../lib/api";
import { studioRowHtml as rowHtml, viewsLabel } from "../lib/studio-rows";
import {
  compareGalleryOrder,
  groupByAvailability,
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
import { paintingFilePaths } from "../lib/painting-edit";

/**
 * Admin island (client-only): studio dashboard — collection index with
 * thumbnails, homepage banner, and gallery ordering. Painting rooms
 * (new + edit) live on their own routes; saving happens there and lands
 * back here. Protected in production by Cloudflare Access;
 * ADMIN_API_TOKEN is local backup.
 */

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Missing #${id}`);
  return el as T;
};

/** Toasts clear themselves after a few seconds — errors included, so a
 * stale complaint never sits over the page. Each new message restarts the
 * clock, and clearing an already-empty line is a no-op. */
let statusTimer = 0;
/**
 * Toast words fade in on arrival and fade out on their way away — under
 * every motion setting, since a snap is itself jarring. One timer covers
 * both phases, so a new message mid-fade-out cancels the goodbye.
 */
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

/** Local preview (dev servers), where publishing + analytics genuinely live
 * only on the production site — never a bug, never a setup step. */
function isLocalPreview(): boolean {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

/** Throwaway browser overlay unless something real can persist: a stored
 * token means the commit, even on localhost — and under `pnpm dev` the
 * local content API persists to the working tree, so rows go live with no
 * token at all. */
async function useOverlayMode(): Promise<boolean> {
  if (!isLocalPreview() || getApiToken() !== "") return false;
  return !(await api.localBackend());
}

/** `/api/status` is public (no token needed), so it doubles as the "is there
 * an API here at all" probe: true under wrangler/live, false under astro dev. */
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

function seedLocalRows(raw: unknown): LocalPainting[] | null {
  if (!Array.isArray(raw)) return null;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isInteger(v) ? v : null;
  const dim = (v: unknown): string =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? String(v) : "";
  const clean: LocalPainting[] = [];
  for (const r of raw) {
    if (typeof r !== "object" || r === null) continue;
    const row = r as Record<string, unknown>;
    if (typeof row["slug"] !== "string" || typeof row["title"] !== "string")
      continue;
    if ((row["title"] as string) === "") continue;
    clean.push({
      slug: row["slug"] as string,
      title: row["title"] as string,
      price:
        typeof row["price"] === "number"
          ? (row["price"] as number)
          : Number(row["price"]),
      sold: row["sold"] === true,
      draft: row["draft"] === true,
      image: str(row["image"]),
      alt: str(row["alt"]),
      description: str(row["description"]),
      widthIn: dim(row["widthIn"]),
      heightIn: dim(row["heightIn"]),
      depthIn: dim(row["depthIn"]),
      medium: str(row["medium"]),
      mdPath: str(row["mdPath"]),
      views: 0,
      order: num(row["order"]),
    });
  }
  return clean;
}

/** Dev practice overlay over the baked list: deletes drop rows, upserts
 * replace same-slug rows or append new ones. */
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

/**
 * Dev fallback: the page baked the collection in at build time, so the
 * index works with no API at all — merged with the practice overlay, so
 * studio-room saves made in this browser show up here. True only when the
 * embedded list parses — otherwise the caller falls through to the error
 * branches.
 */
function renderLocalCollection(): boolean {
  if (localRows === null) {
    const el = document.getElementById("local-collection");
    if (el === null) return false;
    let rows: unknown;
    try {
      rows = JSON.parse(el.textContent ?? "") as unknown;
    } catch {
      return false;
    }
    const seeded = seedLocalRows(rows);
    if (seeded === null) return false;
    localRows = seeded;
    // The static markup already shows these rows — record it so the first
    // render below doesn't swap identical HTML (photos would flicker).
    if (lastRowsKey === null) lastRowsKey = rowsKey(localRows);
  }
  const overlay = loadPracticeOverlay();
  renderRows(mergePractice(localRows, overlay));
  // Practice mode: saves from the studio rooms land in this browser, and
  // clear out with one tap. Only the dev suffix appears — the heading
  // itself is never touched — and only ever on a local preview, never
  // on the live site.
  reveal($("collection-dev"));
  const reset = $("practice-reset") as HTMLButtonElement;
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

function subHtml(title: string): string {
  return `<div class="list-sub"><h3>${title}</h3></div>`;
}

/**
 * Seed the rows key from the baked list before the first API render, so
 * a matching response skips the rebuild entirely — swapping identical
 * markup would destroy and rebuild every photo (a visible flicker).
 * A changed repo still rebuilds, correctly.
 */
function seedRowsKey(): void {
  if (lastRowsKey !== null) return;
  const el = document.getElementById("local-collection");
  if (el === null) return;
  try {
    const seeded = seedLocalRows(JSON.parse(el.textContent ?? "") as unknown);
    if (seeded !== null) lastRowsKey = rowsKey(seeded);
  } catch {
    // Unparseable — the API render below rebuilds unconditionally.
  }
}

/**
 * Signature of exactly what a render shows: sorted rows, rendered fields
 * only. Re-rendering identical markup would destroy and rebuild every
 * photo (a visible flicker), so renderRows skips when nothing changed.
 */
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
        r.image,
        r.mdPath,
        r.order,
      ]),
  );
}

/** Key of what the list currently shows (null until the first render). */
let lastRowsKey: string | null = null;

/**
 * Two columns on desktop — Available left, Drafts right — with Sold in a
 * foldable full-width row underneath; one list on phones. Same renderer
 * as the static markup (studioRowHtml), so hydration swaps identical
 * HTML. Available rows carry the gallery order and drag to re-sort it.
 */
/** Rows behind the current render, for drag-to-reorder lookups. */
let lastRenderedRows: LocalPainting[] = [];

function renderRows(rows: LocalPainting[]): void {
  const list = $("edit-list");
  ($("collection-refresh") as HTMLButtonElement).hidden = true;
  lastRenderedRows = rows;
  // Delegated + idempotent: also joins the SSR first paint, where no
  // re-render happens (photos must not flicker).
  wireReorder(list);
  const key = rowsKey(rows);
  if (key === lastRowsKey) return;
  lastRowsKey = key;
  if (rows.length === 0) {
    list.innerHTML =
      '<li class="list-plain">Nothing here yet — tap Add painting above.</li>';
    return;
  }
  const byTitle = (a: LocalPainting, b: LocalPainting): number =>
    a.title.localeCompare(b.title);
  const drafts = [...rows].filter((r) => r.draft).sort(byTitle);
  const groups = groupByAvailability(rows.filter((r) => !r.draft));
  const available = [...groups.available].sort(compareGalleryOrder);
  const sold = [...groups.sold].sort(byTitle);
  let html =
    `<li class="list-group" data-group="available">` +
    subHtml("Available") +
    `<p class="list-hint">Drag cards to reorder — the homepage follows this order.</p>` +
    `<ul class="group-rows">` +
    (available.length === 0
      ? `<li class="list-plain">Nothing available right now.</li>`
      : available.map(rowHtml).join("")) +
    `</ul></li>`;
  if (drafts.length > 0) {
    html +=
      `<li class="list-group" data-group="drafts">` +
      subHtml("Drafts") +
      `<ul class="group-rows">` +
      drafts.map(rowHtml).join("") +
      `</ul></li>`;
  }
  if (sold.length > 0) {
    html +=
      `<details class="sold-fold" open>` +
      `<summary>${sold.length === 1 ? "1 sold" : `${sold.length} sold`}</summary>` +
      `<ul class="group-rows">` +
      sold.map(rowHtml).join("") +
      `</ul></details>`;
  }
  list.innerHTML = html;
  wireReorder(list);
}

/**
 * Gallery drag-to-reorder: Available cards drag; dropping writes 0..n
 * into each painting's `order:` frontmatter (one live commit) or the
 * practice overlay in dev. Drafts and sold never drag. Listeners attach
 * once to the list (delegation survives re-renders); per-card flags
 * re-apply on every render including the SSR first paint.
 */
let reorderWired = false;
let dragSlug: string | null = null;

function reorderCard(target: EventTarget | null): Element | null {
  // Element, not HTMLElement: drop points land on SVG icon paths too,
  // and those must count the same as the card around them.
  if (!(target instanceof Element)) return null;
  const card = target.closest(".row-card");
  if (card === null) return null;
  if (card.closest('[data-group="available"]') === null) return null;
  return card;
}

function reorderSlug(card: Element): string | null {
  const slug = card.querySelector(".row-del")?.getAttribute("data-slug");
  return typeof slug === "string" && slug !== "" ? slug : null;
}

function clearDropMarks(list: HTMLElement): void {
  for (const el of list.querySelectorAll(".drop-before, .drop-after")) {
    el.classList.remove("drop-before", "drop-after");
  }
}

function wireReorder(list: HTMLElement): void {
  for (const card of list.querySelectorAll(
    '[data-group="available"] .row-card',
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
        // Some browsers need the try — the drag still works.
      }
    }
  });
  list.addEventListener("dragover", (e) => {
    const card = reorderCard(e.target);
    if (card === null || dragSlug === null || reorderSlug(card) === dragSlug) {
      return;
    }
    e.preventDefault();
    const rect = card.getBoundingClientRect();
    const after = (e.clientY - rect.top) / rect.height > 0.5;
    card.classList.toggle("drop-after", after);
    card.classList.toggle("drop-before", !after);
  });
  list.addEventListener("dragleave", (e) => {
    const card = reorderCard(e.target);
    if (card !== null) card.classList.remove("drop-before", "drop-after");
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
    const rect = card.getBoundingClientRect();
    const after = (e.clientY - rect.top) / rect.height > 0.5;
    rows?.insertBefore(dragged, after ? card.nextSibling : card);
    const slug = dragSlug;
    dragSlug = null;
    void persistOrder(rows, slug);
  });
  list.addEventListener("dragend", () => {
    dragSlug = null;
    clearDropMarks(list);
  });
}

/** Write the Available DOM order back as 0..n `order:` frontmatter. */
async function persistOrder(
  rows: Element | null,
  moved: string,
): Promise<void> {
  if (rows === null) return;
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
          order: i,
        });
        changed += 1;
      }
      if (changed === 0) {
        setStatus("That's already the gallery order.");
        return;
      }
      renderLocalCollection();
      setStatus(
        "Gallery order kept in this tab — publish it on the live site.",
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
    if (files.length === 0) {
      setStatus("That's already the gallery order.");
      return;
    }
    setStatus("Saving the gallery order… (live in a few minutes)");
    await api.commitFiles("Reorder gallery", files);
    await refreshCollection();
    setStatus("Gallery order saved — live in a few minutes.");
  } catch (err) {
    setStatus((err as Error).message, true);
    await refreshCollection().catch(() => undefined);
  }
}

/**
 * Delete straight from a dashboard row, after the confirmation modal.
 * Practice rows vanish locally, live rows commit a delete of .md + photo
 * + models.
 */
async function deleteRow(
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
  setStatus(`Deleting "${title}"… (gone in a few minutes)`);
  const content = await api.getPaintingFile(mdPath);
  if (content === null) throw new Error("Couldn't load this painting's file.");
  const parsed = parsePainting(content);
  if (parsed === null) throw new Error("Couldn't read this painting's file.");
  await api.deleteFiles(
    `Delete painting: ${parsed.title}`,
    paintingFilePaths(mdPath, parsed),
  );
  await refreshCollection();
  setStatus(`Deleted "${parsed.title}" — recoverable from repo history.`);
}

/**
 * Row delete behind one shared confirmation modal — the row button never
 * works double duty. DELETE stays disabled for 3.5 seconds so the words
 * get read first; a countdown on the button says why it won't press yet.
 * One delegated listener covers every row, including re-renders.
 */
function wireRowDelete(): void {
  const list = $("edit-list");
  const overlay = document.getElementById("row-confirm");
  const body = document.getElementById("row-confirm-body");
  const no = document.getElementById("row-confirm-no");
  const yes = document.getElementById("row-confirm-yes");
  if (
    overlay === null ||
    no === null ||
    !(no instanceof HTMLButtonElement) ||
    yes === null ||
    !(yes instanceof HTMLButtonElement)
  ) {
    return;
  }
  if (list.dataset.delWired === "1") return;
  list.dataset.delWired = "1";
  let timer: number | null = null;
  let pending: {
    slug: string;
    title: string;
    md: string;
    btn: HTMLButtonElement;
  } | null = null;

  const close = () => {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    pending = null;
    overlay.hidden = true;
  };
  const open = (btn: HTMLButtonElement) => {
    const title =
      btn.dataset.title === ""
        ? "this painting"
        : (btn.dataset.title ?? "this painting");
    pending = {
      slug: btn.dataset.slug ?? "",
      title,
      md: btn.dataset.md ?? "",
      btn,
    };
    if (body !== null) {
      body.textContent =
        `This removes "${title}" from the site. ` +
        `It stays recoverable in the repo history.`;
    }
    overlay.hidden = false;
    yes.disabled = true;
    // Deadline-based, not tick-counted: a stalled tab still arms ~3.5s in.
    const end = Date.now() + 3500;
    const tick = () => {
      const left = Math.max(0, end - Date.now());
      if (left <= 0) {
        if (timer !== null) window.clearInterval(timer);
        timer = null;
        yes.disabled = false;
        yes.textContent = "Delete";
        return;
      }
      yes.textContent = `Delete (${Math.max(1, Math.floor(left / 1000))})`;
    };
    tick();
    timer = window.setInterval(tick, 250);
    no.focus();
  };

  list.addEventListener("click", (e) => {
    const t = e.target instanceof Element ? e.target.closest(".row-del") : null;
    const btn = t instanceof HTMLButtonElement ? t : null;
    if (btn === null || btn.disabled) return;
    open(btn);
  });
  no.addEventListener("click", () => {
    const btn = pending?.btn;
    close();
    // Back to the row that asked — unless it re-rendered away.
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
    // Keep tab cycling between the modal's two buttons.
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
    const { slug, title, md, btn } = pending;
    pending = null;
    overlay.hidden = true;
    btn.disabled = true;
    btn.textContent = "Deleting…";
    void deleteRow(slug, title, md).catch((err: unknown) => {
      btn.disabled = false;
      btn.textContent = "Delete";
      setStatus((err as Error).message, true);
    });
  });
}

async function refreshCollection(): Promise<void> {
  const list = $("edit-list");
  let files: string[];
  try {
    files = (await api.listPaintingFiles()).filter((f) => f.endsWith(".md"));
    ($("collection-refresh") as HTMLButtonElement).hidden = true;
  } catch (err) {
    const retry = $("collection-refresh") as HTMLButtonElement;
    if (err instanceof ApiError && err.status === 401) {
      list.innerHTML =
        "<li>This needs your API token — enter it in Advanced below, then tap Retry.</li>";
      retry.hidden = false;
      return;
    }
    // No publishing backend here (dev): fall back to the list baked into
    // the page — rows, links, and practice edits, all local.
    if (isLocalPreview() && renderLocalCollection()) return;
    if (await apiReachable()) {
      // Reachable API but the list failed (a bad token is handled above,
      // so this is a server problem) — Retry stays out for another try.
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
  // Thumbnails come from the page's baked-in list (built image URLs the
  // API can't hand out) — matched by repo file, not title slug, so a
  // renamed painting keeps its photo. Missing ones simply unshown.
  if (thumbByMd === null) {
    thumbByMd = {};
    const el = document.getElementById("local-collection");
    if (el !== null) {
      try {
        const baked = JSON.parse(el.textContent ?? "") as unknown;
        if (Array.isArray(baked)) {
          for (const r of baked) {
            if (
              typeof r === "object" &&
              r !== null &&
              typeof (r as { mdPath?: unknown }).mdPath === "string" &&
              typeof (r as { image?: unknown }).image === "string"
            ) {
              thumbByMd[(r as { mdPath: string }).mdPath] = (
                r as { image: string }
              ).image;
            }
          }
        }
      } catch {
        // No thumbnails — rows still render with links and prices.
      }
    }
  }
  const rows: LocalPainting[] = [];
  for (const f of files) {
    const mdPath = `src/content/paintings/${f}`;
    const content = await api.getPaintingFile(mdPath);
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
  renderRows(rows);
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
    const reg = (await navigator.serviceWorker
      .ready) as ServiceWorkerRegistration & {
      sync?: unknown;
    };
    sync = reg.sync === undefined ? "unavailable" : "on";
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
    const parsed = JSON.parse(raw) as {
      text?: unknown;
      expires?: unknown;
    };
    if (typeof parsed.text !== "string" || parsed.text.trim() === "")
      return null;
    return {
      text: parsed.text.slice(0, 280),
      expires:
        typeof parsed.expires === "string" && parsed.expires !== ""
          ? parsed.expires
          : null,
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
            ($("f-announce") as HTMLInputElement).value = preview.text;
            ($("f-duration") as unknown as HTMLSelectElement).value = "";
            const meta = $("announce-meta");
            meta.textContent =
              "Preview kept in this browser — open the homepage to see it.";
            fadeIn(meta);
            setBannerRemovable(true);
            return;
          }
        }
        ($("f-announce") as HTMLInputElement).value = banner.text;
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
          ($("f-duration") as unknown as HTMLSelectElement).value = "";
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
        const select = $("f-duration") as unknown as HTMLSelectElement;
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
    ($("f-announce") as HTMLInputElement).value = "";
    saveBanner(true);
  });

  $("announce-save").addEventListener("click", () => {
    saveBanner(false);
  });

  function saveBanner(allowEmpty: boolean): void {
    const text = ($("f-announce") as HTMLInputElement).value
      .trim()
      .slice(0, 280);
    if (text === "" && !allowEmpty) {
      // A nudge, not news: gone quickly.
      setStatus("Write the announcement first — or Remove banner.", true, 3500);
      ($("f-announce") as HTMLInputElement).focus();
      return;
    }
    const durationRaw = ($("f-duration") as unknown as HTMLSelectElement).value;
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
            body === "" ? "Banner cleared." : "Banner updated on the homepage.",
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
          setStatus((err as Error).message, true);
        });
    });
  }

  const tokenInput = $("admin-token") as HTMLInputElement;
  tokenInput.value = getApiToken();
  tokenInput.addEventListener("change", () => {
    setApiToken(tokenInput.value.trim());
    setStatus("Token saved on this device.");
    void refreshFlags();
  });

  $("leave-admin").addEventListener("click", () => {
    setApiToken("");
    window.location.href = "/";
  });

  $("collection-refresh").addEventListener(
    "click",
    () => void refreshCollection(),
  );
  wireRowDelete();

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

  seedRowsKey();
  void refreshCollection();
  void refreshRowViews();
  void refreshFlags();
  void refreshCapabilities();
}

// ClientRouter swaps studio pages without a full load — and skips
// re-running this bundle (same src), so DOMContentLoaded init leaves every
// later visit dead. astro:page-load fires on first load AND every visit;
// its document persists, so one listener covers all visits with no guard.
document.addEventListener("astro:page-load", () => void init());
