import { api, ApiError, getApiToken, setApiToken } from "../lib/api";
import { loadImageFile, prepareImage } from "../lib/image";
import { buildCaption, sharePainting } from "../lib/share";
import { dollarsToCents, formatCAD } from "../lib/money";
import { slugifyTitle } from "../lib/site";
import {
  paintingFilePaths,
  parsePainting,
  patchPainting,
  yamlQuote,
  type PaintingEdits,
} from "../lib/painting-edit";

import { loadArTooling, loadModelViewer } from "../lib/vendor-loader";

/**
 * Admin island (client-only): publish paintings to git, share kit,
 * homepage banner, collector push. Protected in production by
 * Cloudflare Access; ADMIN_API_TOKEN is local backup.
 *
 * Paintings live in git: saving commits a .md + photo (+ AR models) to
 * the repo; Pages rebuilds on push — live a few minutes later.
 */

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Missing #${id}`);
  return el as T;
};

let loadedImage: HTMLImageElement | null = null;
let preparedBlob: Blob | null = null;
let lastPreviewUrl: string | null = null;
let rotation: 0 | 90 | 180 | 270 = 0;
let lastShare: { title: string; caption: string; pageUrl: string } | null = null;

function setStatus(msg: string, isError = false): void {
  const el = $("admin-status");
  el.textContent = msg;
  el.dataset.tone = isError ? "error" : "ok";
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

async function refreshPreview(): Promise<void> {
  if (loadedImage === null) return;
  const prepared = await prepareImage(loadedImage, rotation);
  if (lastPreviewUrl !== null) URL.revokeObjectURL(lastPreviewUrl);
  preparedBlob = prepared.blob;
  ($("ar-try-row") as HTMLDivElement).hidden = false;
  ($("photo-tools") as HTMLDivElement).hidden = false;
  lastPreviewUrl = prepared.previewUrl;
  const img = $<HTMLImageElement>("photo-preview");
  img.src = prepared.previewUrl;
  img.hidden = false;
  ($("photo-empty") as HTMLElement).hidden = true;
  const mb = prepared.blob.size / 1048576;
  const size = mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(prepared.blob.size / 1024))} KB`;
  $("photo-meta").textContent = `${prepared.width} × ${prepared.height} px · ${size} upload`;
  refreshAddPreview();
}

interface LocalRow {
  slug: string;
  title: string;
  price: number;
  sold: boolean;
}

/**
 * Dev fallback: the page baked the collection in at build time, so the
 * list and links render with no API at all. True only when the embedded
 * list parses — otherwise the caller falls through to the error branches.
 */
function renderLocalCollection(): boolean {
  const el = document.getElementById("local-collection");
  if (el === null) return false;
  let rows: unknown;
  try {
    rows = JSON.parse(el.textContent ?? "") as unknown;
  } catch {
    return false;
  }
  if (!Array.isArray(rows)) return false;
  const list = $("edit-list");
  ($("collection-refresh") as HTMLButtonElement).hidden = true;
  const clean = rows.filter(
    (r): r is LocalRow =>
      typeof r === "object" &&
      r !== null &&
      typeof (r as LocalRow).slug === "string" &&
      typeof (r as LocalRow).title === "string" &&
      (r as LocalRow).title !== "",
  );
  if (clean.length === 0) {
    list.innerHTML = "<li>Nothing here yet — add your first painting above.</li>";
    return true;
  }
  const esc = (s: string): string =>
    s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  clean.sort((a, b) => a.title.localeCompare(b.title));
  list.innerHTML = clean
    .map((r) => {
      const cents = dollarsToCents(Number(r.price));
      const price = cents === null ? "Price?" : formatCAD(cents);
      return (
        `<li><a href="/paintings/${esc(r.slug)}"><strong>${esc(r.title)}</strong></a>` +
        ` — ${price} — ${r.sold ? "sold" : "available"}</li>`
      );
    })
    .join("");
  // No Edit buttons here on purpose — saving and deleting need the live
  // site's API, so the list stays read-only.
  setStatus("Showing your current collection — editing needs the live site.");
  return true;
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
    // the page — rows and links, read-only.
    if (isLocalPreview() && renderLocalCollection()) return;
    if (await apiReachable()) {
      // Reachable API but the list failed (a bad token is handled above,
      // so this is a server problem) — Retry stays out for another try.
      list.innerHTML = "<li>Couldn't load the collection — check the connection, then tap Retry.</li>";
      retry.hidden = false;
      return;
    }
    list.innerHTML =
      "<li>Couldn't reach the publishing service — open barbart.ca/admin on the live site, then tap Retry.</li>";
    retry.hidden = false;
    return;
  }
  if (files.length === 0) {
    list.innerHTML = "<li>Nothing here yet — add your first painting above.</li>";
    return;
  }
  const rows: Array<{ path: string; title: string; price: string; sold: boolean; slug: string }> = [];
  for (const f of files) {
    const content = await api.getPaintingFile(`src/content/paintings/${f}`);
    if (content === null) continue;
    const p = parsePainting(content);
    if (p === null || p.title === "") continue;
    rows.push({
      path: `src/content/paintings/${f}`,
      title: p.title,
      price: p.price,
      sold: p.sold,
      slug: slugifyTitle(p.title),
    });
  }
  rows.sort((a, b) => a.title.localeCompare(b.title));
  list.innerHTML = rows
    .map(
      (r, i) =>
        `<li><a href="/paintings/${r.slug}"><strong>${r.title.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)}</strong></a>` +
        ` — $${r.price} — ${r.sold ? "sold" : "available"} ` +
        `<span class="row"><button type="button" data-edit="${i}">Edit here</button></span></li>`,
    )
    .join("");
  list.querySelectorAll("button[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = rows[Number((btn as HTMLElement).dataset["edit"])];
      if (row !== undefined) void openEditForm(row.path);
    });
  });
}

async function openEditForm(path: string): Promise<void> {
  const list = $("edit-list");
  const content = await api.getPaintingFile(path);
  if (content === null) {
    setStatus("Couldn't load that painting.", true);
    return;
  }
  const p = parsePainting(content);
  if (p === null) {
    setStatus("Couldn't read that painting's file.", true);
    return;
  }
  const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  list.innerHTML =
    `<li><label>Title <input id="ed-title" type="text" maxlength="120" value="${esc(p.title)}" /></label>` +
    `<label>Price (CAD) <input id="ed-price" type="number" min="1" step="0.01" inputmode="decimal" value="${esc(p.price)}" /></label>` +
    `<label>Alt text <input id="ed-alt" type="text" maxlength="200" value="${esc(p.alt)}" /></label>` +
    `<label>Description <textarea id="ed-desc" rows="3" maxlength="2000">${esc(p.description)}</textarea></label>` +
    `<div class="row">` +
    `<label>W (in) <input id="ed-w" type="number" min="1" step="0.5" inputmode="decimal" value="${esc(p.widthIn)}" /></label>` +
    `<label>H (in) <input id="ed-h" type="number" min="1" step="0.5" inputmode="decimal" value="${esc(p.heightIn)}" /></label>` +
    `<label>D (in) <input id="ed-d" type="number" min="0.5" step="0.5" inputmode="decimal" value="${esc(p.depthIn)}" /></label>` +
    `</div>` +
    `<label class="check"><input id="ed-sold" type="checkbox"${p.sold ? " checked" : ""} /> Sold</label>` +
    `<span class="row"><button type="button" id="ed-save" class="primary">Save</button> ` +
    `<button type="button" id="ed-cancel">Cancel</button> ` +
    `<button type="button" id="ed-del">Delete…</button></span></li>`;
  ($("ed-cancel") as HTMLButtonElement).addEventListener("click", () => void refreshCollection());
  ($("ed-del") as HTMLButtonElement).addEventListener("click", (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    if (btn.dataset.armed !== "1") {
      btn.dataset.armed = "1";
      btn.textContent = "Tap again to delete";
      setStatus(`This removes "${p.title}" from the site. Tap again to confirm.`, true);
      return;
    }
    btn.disabled = true;
    setStatus(`Deleting "${p.title}"… (gone in a few minutes)`);
    api
      .deleteFiles(`Delete painting: ${p.title}`, paintingFilePaths(path, p))
      .then(() => {
        setStatus(`Deleted "${p.title}" — recoverable from repo history.`);
        return refreshCollection();
      })
      .catch((err: unknown) => {
        btn.disabled = false;
        btn.dataset.armed = "";
        btn.textContent = "Delete…";
        setStatus((err as Error).message, true);
      });
  });
  ($("ed-save") as HTMLButtonElement).addEventListener("click", () => {
    const val = (id: string): string => ($(id) as HTMLInputElement).value.trim();
    const title = val("ed-title");
    const price = Number(val("ed-price"));
    if (title === "" || !(Number.isFinite(price) && price > 0)) {
      setStatus("Title and a valid price are required.", true);
      return;
    }
    const edits: PaintingEdits = {
      title,
      price: price.toFixed(2),
      alt: val("ed-alt"),
      description: ($("ed-desc") as HTMLTextAreaElement).value,
      widthIn: val("ed-w"),
      heightIn: val("ed-h"),
      depthIn: val("ed-d"),
      sold: ($("ed-sold") as HTMLInputElement).checked,
    };
    void (async () => {
      setStatus("Saving… (live in a few minutes)");
      try {
        // Dimension fixes (or a missing preview) rebuild the AR models
        // from the repo photo in the same commit.
        const arMod = await loadArTooling();
        const fix = await arMod.rebuildForDimFix(api.getPhoto, path, p, edits, () =>
          setStatus("Rebuilding wall preview… (true size, takes a few seconds)"),
        );
        await api.commitFiles(`Edit painting: ${title}`, [
          { path, blob: patchPainting(content, fix.edits) },
          ...fix.files,
        ]);
        setStatus(
          fix.note === null ? `Saved "${title}".` : `Saved "${title}" — but ${fix.note}`,
          fix.note !== null,
        );
        await refreshCollection();
      } catch (err) {
        setStatus((err as Error).message, true);
      }
    })();
  });
}

function buildMarkdown(input: {
  title: string;
  price: number;
  alt: string;
  description: string;
  imageFile: string;
  widthIn: number | null;
  heightIn: number | null;
  depthIn: number | null;
  modelGlb: string;
  modelUsdz: string;
}): string {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    "---",
    `title: ${yamlQuote(input.title)}`,
    `dateAdded: ${today}`,
    `image: ${yamlQuote(input.imageFile)}`,
    `alt: ${yamlQuote(input.alt)}`,
    "sold: false",
    `price: ${input.price.toFixed(2)}`,
  ];
  if (input.widthIn !== null) lines.push(`widthIn: ${input.widthIn}`);
  if (input.heightIn !== null) lines.push(`heightIn: ${input.heightIn}`);
  if (input.depthIn !== null) lines.push(`depthIn: ${input.depthIn}`);
  if (input.modelGlb !== "") lines.push(`modelGlb: ${yamlQuote(input.modelGlb)}`);
  if (input.modelUsdz !== "") lines.push(`modelUsdz: ${yamlQuote(input.modelUsdz)}`);
  lines.push("---", input.description === "" ? "Fresh from the studio." : input.description, "");
  return lines.join("\n");
}

/** Unique slug for a new painting, checking the repo's paintings folder. */
async function uniqueSlug(title: string): Promise<string> {
  const base = slugifyTitle(title) === "" ? "untitled" : slugifyTitle(title);
  let files: string[] = [];
  try {
    files = await api.listPaintingFiles();
  } catch {
    // Offline or unconfigured — proceed; the commit may still land.
  }
  const taken = new Set(files);
  if (!taken.has(`${base}.md`)) return base;
  for (let n = 2; n < 100; n += 1) {
    if (!taken.has(`${base}-${n}.md`)) return `${base}-${n}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Live card preview while she types — roughly the gallery card. */
function refreshAddPreview(): void {
  const title = ($("f-title") as HTMLInputElement).value.trim();
  const priceRaw = ($("f-price") as HTMLInputElement).value.trim();
  const panel = $("add-preview");
  const show = title !== "" || priceRaw !== "" || preparedBlob !== null;
  panel.hidden = !show;
  if (!show) return;
  ($("pv-title") as HTMLElement).textContent = title === "" ? "Untitled" : title;
  const cents = dollarsToCents(Number(priceRaw));
  const dim = (id: string): string => {
    const raw = ($(id) as HTMLInputElement).value.trim();
    return raw === "" ? "" : raw;
  };
  const dims = [dim("f-w"), dim("f-h")]
    .filter((d) => d !== "")
    .join(" × ");
  ($("pv-sub") as HTMLElement).textContent =
    `${cents === null ? "Price?" : formatCAD(cents)}${dims === "" ? "" : ` · ${dims} in`}`;
  const img = $("pv-img") as HTMLImageElement;
  if (lastPreviewUrl !== null) {
    img.src = lastPreviewUrl;
    img.hidden = false;
  } else {
    img.hidden = true;
  }
}

/** Inline <model-viewer> test so she can try AR before buyers do. */
function showArPreview(glbUrl: string, usdzUrl: string): void {
  const mount = $("ar-preview");
  mount.hidden = false;
  mount.innerHTML = "";
  // Script tag, not import(): Vite dev won't serve /public files as
  // modules. See src/lib/vendor-loader.ts.
  void loadModelViewer().then(() => {
      const el = document.createElement("model-viewer") as unknown as HTMLElement;
      el.setAttribute("src", glbUrl);
      el.setAttribute("ios-src", usdzUrl);
      el.setAttribute("ar", "");
      el.setAttribute("ar-modes", "webxr scene-viewer quick-look");
      el.setAttribute("ar-scale", "fixed");
      el.setAttribute("ar-placement", "wall");
      el.setAttribute("camera-controls", "");
      el.setAttribute("alt", "Wall preview");
      el.style.width = "100%";
      el.style.height = "22rem";
      el.style.borderRadius = "0.6rem";
      mount.appendChild(el);
    })
    .catch(() => {
      mount.textContent = "Wall preview unavailable in this browser.";
    });
}

async function refreshViews(): Promise<void> {
  const list = $("views-list");
  const retry = $("views-refresh") as HTMLButtonElement;
  try {
    const { views, unconfigured } = await api.paintingViews();
    retry.hidden = true;
    if (unconfigured) {
      // Same response, two meanings: a local preview has no secrets by
      // design, while live truly needs the Cloudflare setup steps.
      list.innerHTML = isLocalPreview()
        ? "<li>View stats only work on the live /admin — this is a local preview.</li>"
        : "<li>View stats aren't set up yet — the Cloudflare steps in the README finish the job.</li>";
      return;
    }
    if (views.length === 0) {
      // Nothing to report — the card stays out of the way.
      ($("sec-views") as HTMLElement).hidden = true;
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
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      list.innerHTML =
        "<li>Views need your API token — enter it in Advanced below, then tap Retry.</li>";
      retry.hidden = false;
      return;
    }
    if (await apiReachable()) {
      list.innerHTML = "<li>View stats aren't available right now — tap Retry.</li>";
    } else {
      list.innerHTML = isLocalPreview()
        ? "<li>Views only work on the live /admin — this is a local preview.</li>"
        : "<li>Could not load views — tap Retry.</li>";
    }
    retry.hidden = false;
  }
}

/** Tell her what this browser can do (Safari vs Chrome, online vs offline). */
async function refreshCapabilities(): Promise<void> {
  const sw = "serviceWorker" in navigator ? "on" : "unavailable";
  let sync = "unavailable";
  try {
    const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
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
      shipFlags.hidden = false;
      $("flag-stripe").textContent = s.stripe ? "on" : "off";
      $("flag-shippo").textContent = s.shippo ? "on" : "off";
    }
  } catch {
    // No API here (e.g. astro dev) — say so instead of leaving "…" dots.
    for (const id of ["flag-email", "flag-push", "flag-stripe", "flag-shippo", "flag-social"]) {
      $(id).textContent = "unavailable in this preview";
    }
    if (isLocalPreview()) {
      const note = $("add-preview-note");
      note.textContent =
        "Saving needs the live site — everything else here works in this preview.";
      (note as HTMLParagraphElement).hidden = false;
    }
  }
}

function blobToFile(blob: Blob, name: string, type: string): File {
  return new File([blob], name, { type });
}

/** Tape measurements from the Add form (null = unmeasured, AR falls back). */
function readDims(): { widthIn: number | null; heightIn: number | null; depthIn: number | null } {
  const numOrNull = (id: string): number | null => {
    const raw = ($(id) as HTMLInputElement).value.trim();
    if (raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 && n <= 240 ? Math.round(n * 10) / 10 : null;
  };
  return { widthIn: numOrNull("f-w"), heightIn: numOrNull("f-h"), depthIn: numOrNull("f-d") };
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
          return;
        }
        if (banner.expires === null) {
          meta.textContent = "Showing now, with no end date.";
          ($("f-duration") as unknown as HTMLSelectElement).value = "";
          return;
        }
        const left = bannerMod.daysLeft(banner.expires);
        meta.textContent =
          left < 0
            ? `Ended ${banner.expires} — hidden on the site.`
            : `Showing now, ends ${banner.expires} (${left === 0 ? "last day" : `${left} days left`}).`;
        // Preselect the lifetime closest to what's left, so saving
        // without touching the dropdown roughly keeps the end date.
        const select = ($("f-duration") as unknown as HTMLSelectElement);
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
    const text = ($("f-announce") as HTMLInputElement).value.trim().slice(0, 280);
    const durationRaw = ($("f-duration") as unknown as HTMLSelectElement).value;
    setStatus("Publishing banner… (live in a few minutes)");
    void import("../lib/banner").then((bannerMod) => {
      const days = durationRaw === "" ? null : Number(durationRaw);
      const body = bannerMod.formatAnnouncement(
        text,
        days === null || !Number.isFinite(days) ? null : bannerMod.expiryForDuration(days),
      );
      api
        .commitFiles("Update homepage banner", [
          { path: "src/content/announcement.txt", blob: body },
        ])
        .then(() =>
          setStatus(body === "" ? "Banner cleared." : "Banner updated on the homepage."),
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

  // The working form stays out of sight until she means it — opening
  // animates the card wider (fields left, photo square right).
  const addToggle = $("add-toggle") as HTMLButtonElement;
  const uploadForm = $("upload-form") as HTMLFormElement;
  const addCard = $("sec-add");
  let addAnim = 0;
  addToggle.addEventListener("click", () => {
    addAnim += 1;
    const turn = addAnim;
    if (uploadForm.hidden) {
      uploadForm.hidden = false;
      addToggle.textContent = "Close";
      // Next frame so the expand animates instead of snapping in.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (turn !== addAnim) return;
          addCard.classList.add("open");
          ($("f-title") as HTMLInputElement).focus();
        }),
      );
    } else {
      addCard.classList.remove("open");
      addToggle.textContent = "Add new painting";
      const hide = (): void => {
        if (turn === addAnim) uploadForm.hidden = true;
      };
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) hide();
      else window.setTimeout(hide, 350);
    }
  });

  const fileInput = $("photo-file") as HTMLInputElement;
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file === undefined) return;
    rotation = 0;
    loadImageFile(file)
      .then(async (img) => {
        loadedImage = img;
        await refreshPreview();
      })
      .catch((err: unknown) => {
        const name = (file.name ?? "").toLowerCase();
        const heic =
          file.type === "image/heic" ||
          file.type === "image/heif" ||
          name.endsWith(".heic") ||
          name.endsWith(".heif");
        setStatus(
          `${(err as Error).message}.${heic ? " This looks like HEIC — iPhones read it, but desktop browsers often don't. Re-upload from the phone or export as JPEG first." : ""}`,
          true,
        );
      });
  });

  for (const deg of [90, 270] as const) {
    $(`rotate-${deg}`).addEventListener("click", () => {
      rotation = ((rotation + deg) % 360) as 0 | 90 | 180 | 270;
      void refreshPreview().catch((err: unknown) => setStatus((err as Error).message, true));
    });
  }

  $("ar-try").addEventListener("click", () => {
    if (preparedBlob === null) {
      setStatus("Choose a photo first — then try the wall preview.", true);
      return;
    }
    setStatus("Building wall preview… (true size, takes a few seconds)");
    const source = preparedBlob;
    void (async () => {
      try {
        const { buildArModels, estimateDims } = await loadArTooling();
        // Decode the prepared photo so the preview matches the card.
        const arImg = await loadImageFile(blobToFile(source, "ar-source.jpg", "image/jpeg"));
        const { widthIn, heightIn, depthIn } = readDims();
        const dims = estimateDims(arImg, widthIn, heightIn, depthIn);
        const models = await buildArModels(arImg, dims.w, dims.h, dims.d);
        showArPreview(URL.createObjectURL(models.glb), URL.createObjectURL(models.usdz));
        setStatus("Wall preview below — preview only, nothing published yet.");
      } catch (err) {
        setStatus(
          `AR preview failed: ${(err as Error).message} — you can still save without it.`,
          true,
        );
      }
    })();
  });

  $("upload-form").addEventListener("submit", (e) => {
    e.preventDefault();
    void (async () => {
      const title = ($("f-title") as HTMLInputElement).value.trim();
      const price = Number(($("f-price") as HTMLInputElement).value);
      const priceCents = dollarsToCents(price);
      if (title === "" || priceCents === null) {
        setStatus("Title and a valid price are required.", true);
        return;
      }
      if (preparedBlob === null) {
        setStatus("Choose a photo first.", true);
        return;
      }
      const { widthIn, heightIn, depthIn } = readDims();
      const alt = ($("f-alt") as HTMLInputElement).value.trim();
      const description = ($("f-desc") as HTMLTextAreaElement).value.trim();

      setStatus("Publishing… (photo, page, and preview in one commit)");
      try {
        const slug = await uniqueSlug(title);
        const imageFile = `${slug}.jpg`;
        const pageUrl = `${window.location.origin}/paintings/${slug}`;
        const files: Array<{ path: string; blob: Blob | string }> = [
          // Placeholder markdown first so every path below is complete even
          // if AR fails halfway — the AR retry overwrites the same files.
          {
            path: `src/content/paintings/${slug}.md`,
            blob: buildMarkdown({
              title,
              price,
              alt,
              description,
              imageFile,
              widthIn,
              heightIn,
              depthIn,
              modelGlb: "",
              modelUsdz: "",
            }),
          },
          { path: `src/content/paintings/${imageFile}`, blob: preparedBlob },
        ];
        let modelGlb = "";
        let modelUsdz = "";
        let glbBlob: Blob | null = null;
        let usdzBlob: Blob | null = null;
        if (($("f-ar") as HTMLInputElement).checked) {
          setStatus("Building wall preview… (true size, takes a few seconds)");
          try {
            const { buildArModels, estimateDims } = await loadArTooling();
            // Decode the prepared (rotated/cropped) photo so the model
            // matches exactly what buyers see.
            const arImg = await loadImageFile(
              blobToFile(preparedBlob, "ar-source.jpg", "image/jpeg"),
            );
            const dims = estimateDims(arImg, widthIn, heightIn, depthIn);
            const models = await buildArModels(arImg, dims.w, dims.h, dims.d);
            glbBlob = models.glb;
            usdzBlob = models.usdz;
            modelGlb = `/models/${slug}.glb`;
            modelUsdz = `/models/${slug}.usdz`;
            files.push(
              { path: `public/models/${slug}.glb`, blob: models.glb },
              { path: `public/models/${slug}.usdz`, blob: models.usdz },
            );
            // Rebuild the markdown with the model URLs in.
            files[0] = {
              path: `src/content/paintings/${slug}.md`,
              blob: buildMarkdown({
                title,
                price,
                alt,
                description,
                imageFile,
                widthIn,
                heightIn,
                depthIn,
                modelGlb,
                modelUsdz,
              }),
            };
          } catch (err) {
            console.error(err);
            setStatus("Wall preview build failed — publishing without it. Uncheck the wall preview next time to skip the wait.");
          }
        }
        await api.commitFiles(`Add painting: ${title}`, files);
        if (glbBlob !== null && usdzBlob !== null) {
          // Preview from memory — the committed files go live after rebuild.
          showArPreview(URL.createObjectURL(glbBlob), URL.createObjectURL(usdzBlob));
        }
        const caption = buildCaption({
          title,
          priceCents,
          alt,
          description,
          pageUrl,
          widthIn,
          heightIn,
          depthIn,
        });
        lastShare = { title, caption, pageUrl };
        // Subtle confirmation buzz on phones (no-op where unsupported).
        try {
          if (typeof navigator.vibrate === "function") navigator.vibrate(10);
        } catch {
          // ignore
        }
        ($("share-caption") as HTMLTextAreaElement).value = caption;
        $("share-panel").hidden = false;
        setStatus(
          `Published "${title}" (${formatCAD(priceCents)}) — live in a few minutes at ${pageUrl}.`,
        );
        (e.target as HTMLFormElement).reset();
        loadedImage = null;
        // The form is empty again — drop the published photo from memory
        // too, or the next Save would silently reuse it.
        if (lastPreviewUrl !== null) URL.revokeObjectURL(lastPreviewUrl);
        lastPreviewUrl = null;
        preparedBlob = null;
        rotation = 0;
        ($("photo-preview") as HTMLImageElement).hidden = true;
        ($("photo-empty") as HTMLElement).hidden = false;
        ($("ar-try-row") as HTMLDivElement).hidden = true;
        ($("photo-tools") as HTMLDivElement).hidden = true;
        $("photo-meta").textContent = "";
        refreshAddPreview();
      } catch (err) {
        setStatus((err as Error).message, true);
      }
    })();
  });

  $("share-native").addEventListener("click", () => {
    if (lastShare === null) return;
    const caption = ($("share-caption") as HTMLTextAreaElement).value;
    void sharePainting({
      title: lastShare.title,
      caption,
      pageUrl: lastShare.pageUrl,
      imageBlob: preparedBlob ?? undefined,
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
  $("collection-refresh").addEventListener("click", () => void refreshCollection());
  for (const id of ["f-title", "f-price", "f-w", "f-h"]) {
    $(id).addEventListener("input", () => refreshAddPreview());
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
