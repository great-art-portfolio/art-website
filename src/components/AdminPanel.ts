import { api, ApiError, getApiToken, setApiToken } from "../lib/api";
import { sharePainting } from "../lib/share";
import { studioRowHtml as rowHtml } from "../lib/studio-rows";
import { groupByAvailability, slugifyTitle } from "../lib/site";
import { parsePainting } from "../lib/painting-edit";
import {
  clearPracticeOverlay,
  loadPracticeOverlay,
  practiceCount,
  practiceDelete,
  type PracticeOverlay,
} from "../lib/practice";
import { paintingFilePaths } from "../lib/painting-edit";

/**
 * Admin island (client-only): studio dashboard — collection index with
 * thumbnails, share kit, homepage banner, collector push. Painting rooms
 * (new + edit) live on their own routes; saving happens there and lands
 * back here. Protected in production by Cloudflare Access;
 * ADMIN_API_TOKEN is local backup.
 */

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Missing #${id}`);
  return el as T;
};

let lastShare: { title: string; caption: string; pageUrl: string } | null =
  null;

/** Toasts clear themselves after a few seconds — errors included, so a
 * stale complaint never sits over the page. Each new message restarts the
 * clock, and clearing an already-empty line is a no-op. */
let statusTimer = 0;
function setStatus(msg: string, isError = false): void {
  const el = $("admin-status");
  el.textContent = msg;
  el.dataset.tone = isError ? "error" : "ok";
  // Re-rise the toast on every message (no-op motion when reduced).
  el.classList.remove("toast-in");
  void el.offsetWidth;
  el.classList.add("toast-in");
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    const live = document.getElementById("admin-status");
    if (live === null) return;
    live.textContent = "";
    live.classList.remove("toast-in");
  }, 6000);
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
}

/** Baked-in list, seeded once per visit (dev practice merges over it). */
let localRows: LocalPainting[] | null = null;
/** Built thumbnail URLs by slug, parsed once from the baked-in list. */
let thumbBySlug: Record<string, string> | null = null;

function seedLocalRows(raw: unknown): LocalPainting[] | null {
  if (!Array.isArray(raw)) return null;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
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
    const row: LocalPainting = { ...p, image: "", mdPath: "" };
    if (at >= 0) {
      const prev = kept[at];
      kept[at] = {
        ...row,
        image: prev?.image ?? "",
        mdPath: prev?.mdPath ?? "",
      };
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
 * Signature of exactly what a render shows: sorted rows, rendered fields
 * only. Re-rendering identical markup would destroy and rebuild every
 * photo (a visible flicker), so renderRows skips when nothing changed.
 */
function rowsKey(rows: LocalPainting[]): string {
  return JSON.stringify(
    [...rows]
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((r) => [
        r.slug,
        r.title,
        r.price,
        r.sold,
        r.draft,
        r.image,
        r.mdPath,
      ]),
  );
}

/** Key of what the list currently shows (null until the first render). */
let lastRowsKey: string | null = null;

/**
 * Two columns on desktop — Available left, Drafts/Sold right — one list
 * on phones. Same renderer as the static markup (studioRowHtml), so
 * hydration swaps identical HTML.
 */
function renderRows(rows: LocalPainting[]): void {
  const list = $("edit-list");
  ($("collection-refresh") as HTMLButtonElement).hidden = true;
  const key = rowsKey(rows);
  if (key === lastRowsKey) return;
  lastRowsKey = key;
  if (rows.length === 0) {
    list.innerHTML =
      '<li class="list-plain">Nothing here yet — tap Add painting above.</li>';
    return;
  }
  const flat = [...rows].sort((a, b) => a.title.localeCompare(b.title));
  const drafts = flat.filter((r) => r.draft);
  const groups = groupByAvailability(flat.filter((r) => !r.draft));
  let html =
    `<li class="list-group" data-group="available">` +
    subHtml("Available") +
    `<ul class="group-rows">` +
    (groups.available.length === 0
      ? `<li class="list-plain">Nothing available right now.</li>`
      : groups.available.map(rowHtml).join("")) +
    `</ul></li>`;
  if (drafts.length > 0 || groups.sold.length > 0) {
    html += `<li class="list-group" data-group="later">`;
    if (drafts.length > 0) {
      html +=
        subHtml("Drafts") +
        `<ul class="group-rows">` +
        drafts.map(rowHtml).join("") +
        `</ul>`;
    }
    if (groups.sold.length > 0) {
      html +=
        subHtml("Sold") +
        `<ul class="group-rows">` +
        groups.sold.map(rowHtml).join("") +
        `</ul>`;
    }
    html += `</li>`;
  }
  list.innerHTML = html;
}

/**
 * Delete straight from a dashboard row. First tap arms the button with an
 * "Are you sure?" in words; the second tap deletes for real — practice
 * rows vanish locally, live rows commit a delete of .md + photo + models.
 */
async function deleteRow(
  slug: string,
  title: string,
  mdPath: string,
): Promise<void> {
  if (isLocalPreview() && getApiToken() === "") {
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

/** One delegated listener covers every row, including re-renders. */
function wireRowDelete(): void {
  const list = $("edit-list");
  if (list.dataset.delWired === "1") return;
  list.dataset.delWired = "1";
  list.addEventListener("click", (e) => {
    const t = e.target instanceof Element ? e.target.closest(".row-del") : null;
    const btn = t instanceof HTMLButtonElement ? t : null;
    if (btn === null || btn.disabled) return;
    const slug = btn.dataset.slug ?? "";
    const title =
      btn.dataset.title === ""
        ? "this painting"
        : (btn.dataset.title ?? "this painting");
    if (btn.dataset.armed !== "1") {
      btn.dataset.armed = "1";
      btn.classList.add("armed");
      btn.textContent = "Are you sure? Tap again to delete";
      setStatus(
        `This removes "${title}" from the site. Tap again to confirm.`,
        true,
      );
      return;
    }
    btn.disabled = true;
    btn.classList.remove("armed");
    btn.textContent = "Deleting…";
    void deleteRow(slug, title, btn.dataset.md ?? "").catch((err: unknown) => {
      btn.disabled = false;
      btn.dataset.armed = "";
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
  // API can't hand out) — matched by slug, missing ones simply unshown.
  if (thumbBySlug === null) {
    thumbBySlug = {};
    const el = document.getElementById("local-collection");
    if (el !== null) {
      try {
        const baked = JSON.parse(el.textContent ?? "") as unknown;
        if (Array.isArray(baked)) {
          for (const r of baked) {
            if (
              typeof r === "object" &&
              r !== null &&
              typeof (r as { slug?: unknown }).slug === "string" &&
              typeof (r as { image?: unknown }).image === "string"
            ) {
              thumbBySlug[(r as { slug: string }).slug] = (
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
    const content = await api.getPaintingFile(`src/content/paintings/${f}`);
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
      image: thumbBySlug[slug] ?? "",
      alt: p.alt,
      description: p.description,
      widthIn: p.widthIn,
      heightIn: p.heightIn,
      depthIn: p.depthIn,
      medium: p.medium,
      mdPath: `src/content/paintings/${f}`,
    });
  }
  renderRows(rows);
}

async function refreshViews(): Promise<void> {
  const list = $("views-list");
  const retry = $("views-refresh") as HTMLButtonElement;
  // The card starts hidden in markup — it only appears once there is
  // something to show, so loading never flashes an empty card.
  const card = $("sec-views") as HTMLElement;
  try {
    const { views, unconfigured } = await api.paintingViews();
    retry.hidden = true;
    if (unconfigured) {
      // Same response, two meanings: a local preview has no secrets by
      // design, while live truly needs the Cloudflare setup steps.
      list.innerHTML = isLocalPreview()
        ? "<li>View stats only work on the live /admin — this is a local preview.</li>"
        : "<li>View stats aren't set up yet — the Cloudflare steps in the README finish the job.</li>";
      reveal(card);
      return;
    }
    if (views.length === 0) {
      // Nothing to report — the card stays out of the way.
      card.hidden = true;
      return;
    }
    const max = Math.max(...views.map((v) => v.views));
    list.innerHTML = views
      .map((v) => {
        const slug = v.slug.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
        const pct = max > 0 ? Math.round((v.views / max) * 100) : 0;
        return (
          `<li><em>${slug}</em> — ${v.views} views` +
          `<span class="view-bar" aria-hidden="true"><span style="width:${pct}%"></span></span></li>`
        );
      })
      .join("");
    reveal(card);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      list.innerHTML =
        "<li>Views need your API token — enter it in Advanced below, then tap Retry.</li>";
      retry.hidden = false;
      return;
    }
    if (await apiReachable()) {
      list.innerHTML =
        "<li>View stats aren't available right now — tap Retry.</li>";
    } else {
      list.innerHTML = isLocalPreview()
        ? "<li>Views only work on the live /admin — this is a local preview.</li>"
        : "<li>Could not load views — tap Retry.</li>";
    }
    retry.hidden = false;
    reveal(card);
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
    $("flag-social").textContent = s.socialPost ? "on (auto)" : "share kit";
    // Off means off — the whole line hides instead of reporting it.
    const shipFlags = $("ship-flags");
    if (!s.shippo && !s.stripe) {
      shipFlags.hidden = true;
    } else {
      reveal(shipFlags);
      $("flag-stripe").textContent = s.stripe ? "on" : "off";
      $("flag-shippo").textContent = s.shippo ? "on" : "off";
    }
  } catch {
    // No API here (e.g. astro dev) — say so instead of leaving "…" dots.
    for (const id of [
      "flag-email",
      "flag-push",
      "flag-stripe",
      "flag-shippo",
      "flag-social",
    ]) {
      $(id).textContent = "unavailable in this preview";
    }
    reveal($("ship-flags"));
  }
}

function init(): void {
  api
    .getBanner()
    .then((raw) => {
      void import("../lib/banner").then((bannerMod) => {
        const banner = bannerMod.parseAnnouncement(raw);
        ($("f-announce") as HTMLInputElement).value = banner.text;
        const meta = $("announce-meta");
        if (banner.text === "") {
          meta.textContent = "No banner showing right now.";
          fadeIn(meta);
          return;
        }
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

  $("announce-save").addEventListener("click", () => {
    const text = ($("f-announce") as HTMLInputElement).value
      .trim()
      .slice(0, 280);
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
        .then(() =>
          setStatus(
            body === "" ? "Banner cleared." : "Banner updated on the homepage.",
          ),
        )
        .catch((err: unknown) => setStatus((err as Error).message, true));
    });
  });

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

  $("share-native").addEventListener("click", () => {
    if (lastShare === null) return;
    const caption = ($("share-caption") as HTMLTextAreaElement).value;
    void sharePainting({
      title: lastShare.title,
      caption,
      pageUrl: lastShare.pageUrl,
    }).then((result) => {
      setStatus(
        result === "shared"
          ? "Share sheet opened — post it to Instagram/Facebook."
          : result === "copied"
            ? "Caption copied — paste it into your post."
            : "Sharing failed on this device; copy the caption manually.",
        result === "failed",
      );
    });
  });

  $("share-copy").addEventListener("click", () => {
    const caption = ($("share-caption") as HTMLTextAreaElement).value;
    navigator.clipboard
      .writeText(caption)
      .then(() => setStatus("Caption copied."))
      .catch(() => setStatus("Copy failed — select the text manually.", true));
  });

  api
    .collectorCount()
    .then((n) => {
      $("collectors-hint").textContent =
        n === 0
          ? "No collectors yet — visitors subscribe with “Notify me” on the homepage."
          : `${n} collector${n === 1 ? "" : "s"} subscribed — “Notify collectors” sends them a phone alert.`;
    })
    .catch(() => undefined);

  $("notify-collectors").addEventListener("click", () => {
    setStatus("Notifying collectors…");
    api
      .notifyCollectors()
      .then((r) => setStatus(`Notified ${r.sent} of ${r.total} collectors.`))
      .catch((err: unknown) => setStatus((err as Error).message, true));
  });

  $("views-refresh").addEventListener("click", () => void refreshViews());
  $("collection-refresh").addEventListener(
    "click",
    () => void refreshCollection(),
  );
  wireRowDelete();

  // Landing here from a painting room: its confirmation toast and, after
  // a publish, a ready-made share caption ride along in session storage.
  try {
    const flash = window.sessionStorage.getItem("studio-flash");
    if (flash !== null) {
      window.sessionStorage.removeItem("studio-flash");
      setStatus(flash);
    }
    const shareRaw = window.sessionStorage.getItem("studio-share");
    if (shareRaw !== null) {
      window.sessionStorage.removeItem("studio-share");
      const share = JSON.parse(shareRaw) as {
        title: string;
        caption: string;
        pageUrl: string;
      };
      lastShare = share;
      ($("share-caption") as HTMLTextAreaElement).value = share.caption;
      ($("share-panel") as HTMLElement).hidden = false;
    }
  } catch {
    // Browsers without session storage just miss the handoff.
  }

  void refreshCollection();
  void refreshViews();
  void refreshFlags();
  void refreshCapabilities();
}

// ClientRouter swaps studio pages without a full load — and skips
// re-running this bundle (same src), so DOMContentLoaded init leaves every
// later visit dead. astro:page-load fires on first load AND every visit;
// its document persists, so one listener covers all visits with no guard.
document.addEventListener("astro:page-load", () => void init());
