import { api } from "../lib/api";
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

function greet(): void {
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  $("admin-greeting").textContent = `Good ${part}.`;
}

function setStatus(msg: string, isError = false): void {
  const el = $("admin-status");
  el.textContent = msg;
  el.dataset.tone = isError ? "error" : "ok";
}

async function refreshPreview(): Promise<void> {
  if (loadedImage === null) return;
  const prepared = await prepareImage(loadedImage, rotation);
  if (lastPreviewUrl !== null) URL.revokeObjectURL(lastPreviewUrl);
  preparedBlob = prepared.blob;
  lastPreviewUrl = prepared.previewUrl;
  const img = $<HTMLImageElement>("photo-preview");
  img.src = prepared.previewUrl;
  img.hidden = false;
  const mb = prepared.blob.size / 1048576;
  const size = mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(prepared.blob.size / 1024))} KB`;
  $("photo-meta").textContent = `${prepared.width} × ${prepared.height} px · ${size} upload`;
  refreshAddPreview();
}

async function refreshCollection(): Promise<void> {
  const list = $("edit-list");
  let files: string[];
  try {
    files = (await api.listPaintingFiles()).filter((f) => f.endsWith(".md"));
    ($("collection-refresh") as HTMLButtonElement).hidden = true;
  } catch {
    list.innerHTML =
      "<li>Couldn't reach the publishing service — open barbart.ca/admin on the live site, then tap Retry.</li>";
    ($("collection-refresh") as HTMLButtonElement).hidden = false;
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
          setStatus("Rebuilding AR preview… (true size, takes a few seconds)"),
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
      el.setAttribute("alt", "AR preview");
      el.style.width = "100%";
      el.style.height = "22rem";
      el.style.borderRadius = "0.6rem";
      mount.appendChild(el);
    })
    .catch(() => {
      mount.textContent = "AR preview unavailable in this browser.";
    });
}

async function refreshViews(): Promise<void> {
  const list = $("views-list");
  try {
    const { views, unconfigured } = await api.paintingViews();
    ($("views-refresh") as HTMLButtonElement).hidden = true;
    if (unconfigured) {
      list.innerHTML =
        "<li>View stats aren't set up yet — the Cloudflare steps in the README finish the job.</li>";
      return;
    }
    if (views.length === 0) {
      list.innerHTML = "<li>No views yet.</li>";
      return;
    }
    list.innerHTML = views
      .map((v) => {
        const slug = v.slug.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
        return `<li><em>${slug}</em> — ${v.views} views</li>`;
      })
      .join("");
  } catch {
    ($("views-refresh") as HTMLButtonElement).hidden = false;
    const local =
      window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    list.innerHTML = local
      ? "<li>Views only work on the live /admin — this is a local preview.</li>"
      : "<li>Could not load views — tap Retry.</li>";
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
    $("flag-stripe").textContent = s.stripe ? "on" : "off";
    $("flag-shippo").textContent = s.shippo ? "on" : "off";
    $("flag-social").textContent = s.socialPost ? "on (auto)" : "share kit";
  } catch {
    // API not reachable locally until wrangler pages dev.
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
  greet();

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
  tokenInput.value = sessionStorage.getItem("ADMIN_API_TOKEN") ?? "";
  tokenInput.addEventListener("change", () => {
    sessionStorage.setItem("ADMIN_API_TOKEN", tokenInput.value.trim());
    setStatus("Token saved on this device.");
    void refreshFlags();
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
      setStatus("Choose a photo first — then try the AR preview.", true);
      return;
    }
    setStatus("Building AR preview… (true size, takes a few seconds)");
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
        setStatus("AR preview below — preview only, nothing published yet.");
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
          setStatus("Building AR preview… (true size, takes a few seconds)");
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
            setStatus("AR build failed — publishing without it. Uncheck AR next time to skip the wait.");
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

  $("share-auto").addEventListener("click", () => {
    if (lastShare === null) return;
    const caption = ($("share-caption") as HTMLTextAreaElement).value;
    setStatus("Trying one-click post…");
    api
      .autoPost({ text: caption, imageUrl: lastShare.pageUrl })
      .then(() => setStatus("Posted automatically."))
      .catch((err: unknown) => setStatus((err as Error).message, true));
  });

  api
    .collectorCount()
    .then((n) => {
      $("collectors-hint").textContent =
        n === 0
          ? "No collectors subscribed yet — the button appears on the homepage."
          : `${n} collector${n === 1 ? "" : "s"} will get a push alert.`;
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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
