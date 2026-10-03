/** Draft and edit rooms. Both render the shared PaintingDetail layout, so the
 * editor matches the buyer page. Saving commits the .md, photo, and AR
 * models. Local dev without a token uses the practice overlay. */
import { api, existingTitles, getApiToken, uniqueSlug } from "../lib/api";
import { loadImageFile, prepareImage } from "../lib/image";

import { dollarsToCents, formatCAD } from "../lib/money";
import { formatDimensions } from "../lib/dims";
import { isTitleTaken, slugifyTitle } from "../lib/site";
import { buildShareCaption } from "../lib/share-caption";
import {
  appendSlugHistory,
  buildMarkdown,
  normalizePublishOn,
  parsePainting,
  patchPainting,
  setTrash,
  todayKey,
  type PaintingEdits,
  type ParsedPainting,
} from "../lib/painting-edit";
import { loadArTooling, loadModelViewer } from "../lib/vendor-loader";
import { readBackup } from "../lib/autosave";
import { $, maybe, maybeButton, studioMode } from "../lib/dom";
import { errorMessage } from "../lib/errors";
import {
  practiceDelete,
  practiceUpsert,
  type PracticePainting,
} from "../lib/practice";

/** Toast that fades in and dismisses itself. One timer drives both phases. */
let statusTimer = 0;
function setStatus(msg: string, isError = false): void {
  const el = maybe("de-status");
  if (el === null) return;
  window.clearTimeout(statusTimer);
  el.classList.remove("toast-out");
  el.textContent = msg;
  el.dataset.tone = isError ? "error" : "ok";
  el.classList.remove("toast-in");
  void el.offsetWidth;
  el.classList.add("toast-in");
  statusTimer = window.setTimeout(() => {
    const live = document.getElementById("de-status");
    if (live === null) return;
    live.classList.add("toast-out");
    statusTimer = window.setTimeout(() => {
      const gone = document.getElementById("de-status");
      if (gone === null) return;
      gone.textContent = "";
      gone.classList.remove("toast-in", "toast-out");
    }, 260);
  }, 6000);
}

function isLocalPreview(): boolean {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

/** Confirms before publishing. Every room and mode asks, which the date
 * hint's "after your confirmation" wording relies on. */
function confirmPublish(title: string): boolean {
  return window.confirm(
    `Publish "${title}" now? It goes live on the site in a few minutes.`,
  );
}

/** True when saves should go to the localStorage practice overlay. A stored
 * token commits for real, and under `pnpm dev:studio` the local content API
 * writes the working tree without one. */
async function useOverlayMode(): Promise<boolean> {
  if (!isLocalPreview() || getApiToken() !== "") return false;
  return !(await api.localBackend());
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

const numOrNull = (raw: string): number | null => {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : null;
};

// Photo state: the prepared upload blob, its rotation, and the preview models
// built from it. The models are rebuilt whenever any of these change.
let loadedImage: HTMLImageElement | null = null;
let preparedBlob: Blob | null = null;
let lastPreviewUrl: string | null = null;
let rotation: 0 | 90 | 180 | 270 = 0;
let photoGen = 0;
let previewModels: { sig: string; glb: Blob; usdz: Blob } | null = null;
let photoReplaced = false;

function readDims(): {
  widthIn: number | null;
  heightIn: number | null;
  depthIn: number | null;
} {
  return {
    widthIn: numOrNull($("de-w").value),
    heightIn: numOrNull($("de-h").value),
    depthIn: numOrNull($("de-d").value),
  };
}

function modelSig(): string | null {
  if (preparedBlob === null) return null;
  const { widthIn, heightIn, depthIn } = readDims();
  return [photoGen, rotation, widthIn, heightIn, depthIn].map(String).join("|");
}

/**
 * Last HTML written to each preview node, so unchanged fields are skipped.
 * Updates don't fade because a fade on every keystroke looks like flashing.
 */
const previewShown = new WeakMap<HTMLElement, string>();

function setPreviewHtml(el: HTMLElement, html: string): void {
  // Compare against the stored string. Reading innerHTML back can change
  // quoting.
  if (previewShown.get(el) === html) return;
  previewShown.set(el, html);
  el.innerHTML = html;
}

/** Updates the buyer preview from the form fields. */
function refreshPreview(): void {
  const title = $("de-title").value.trim();
  const priceRaw = $("de-price").value.trim();
  setPreviewHtml($("pv-title"), escHtml(title === "" ? "Untitled" : title));
  const cents = dollarsToCents(Number(priceRaw));
  setPreviewHtml(
    $("pv-price"),
    escHtml(cents === null ? "Price?" : formatCAD(cents)),
  );
  const { widthIn, heightIn, depthIn } = readDims();
  const medium = $("de-medium").value.trim();
  const meta = [
    medium === "" ? undefined : medium,
    formatDimensions(widthIn, heightIn, depthIn),
  ]
    .filter((s) => s !== undefined && s !== "")
    .join(" · ");
  setPreviewHtml($("pv-meta"), escHtml(meta));
  const raw = $("de-desc").value;
  setPreviewHtml(
    $("pv-desc"),
    raw
      .split(/\n\s*\n/)
      .map((para) => para.trim())
      .filter((para) => para !== "")
      .map((para) => `<p>${escHtml(para)}</p>`)
      .join(""),
  );
  // Alt text isn't visible, but the preview photos get it so screen readers
  // announce what buyers will hear.
  const altText = $("de-alt").value.trim();
  const liveAlt =
    altText === "" ? ($("pv-title").textContent ?? "Painting") : altText;
  for (const sel of ["#de-photo-preview", "#photo-wrap img"]) {
    const img = document.querySelector<HTMLImageElement>(sel);
    if (img !== null) img.alt = liveAlt;
  }
  refreshShareCaption();
}

/** The share caption follows the preview until it's edited by hand. After
 * that the custom text is kept for the visit. The caption is built from the
 * preview nodes rather than re-reading the fields. */
let shareDirty = false;

function refreshShareCaption(): void {
  const box = maybe("de-share-text");
  if (box === null || shareDirty) return;
  // The preview price omits "CAD", but the caption should match the buyer
  // page, so rebuild the price from the field.
  const cents = dollarsToCents(Number(maybe("de-price")?.value.trim() ?? ""));
  box.value = buildShareCaption({
    title: maybe("pv-title")?.textContent ?? "",
    priceLabel: cents === null ? null : `${formatCAD(cents)} CAD`,
    meta: maybe("pv-meta")?.textContent ?? "",
    slug: document.getElementById("main")?.dataset.slug ?? "",
  });
}

/** Shows share status inline. With toast set, it shows as a top toast like
 * the room's error toast and clears after four seconds. */
let shareToastTimer = 0;
function sayShare(msg: string, toast = false): void {
  const el = maybe("de-share-status");
  if (el === null) return;
  window.clearTimeout(shareToastTimer);
  el.classList.remove("toast-out");
  el.textContent = msg;
  if (toast) el.dataset.tone = "toast";
  else delete el.dataset.tone;
  el.classList.remove("toast-in");
  void el.offsetWidth;
  el.classList.add("toast-in");
  if (!toast) return;
  shareToastTimer = window.setTimeout(() => {
    const live = document.getElementById("de-share-status");
    if (live === null) return;
    live.classList.add("toast-out");
    shareToastTimer = window.setTimeout(() => {
      const gone = document.getElementById("de-share-status");
      if (gone === null) return;
      gone.textContent = "";
      delete gone.dataset.tone;
      gone.classList.remove("toast-in", "toast-out");
    }, 260);
  }, 4000);
}

/** URL of the displayed photo, honoring srcset, or "" when there's none. */
function sharePhotoUrl(): string {
  const img = document.querySelector("#photo-wrap img");
  if (!(img instanceof HTMLImageElement)) return "";
  return img.currentSrc === "" ? img.src : img.currentSrc;
}

/** Whether the share sheet accepts image files, probed with an empty file. */
function canFileShare(): boolean {
  try {
    return (
      typeof navigator.share === "function" &&
      (typeof navigator.canShare !== "function" ||
        navigator.canShare({
          files: [new File([], "probe.jpg", { type: "image/jpeg" })],
        }))
    );
  } catch {
    return false;
  }
}

/** Social share helper: a prefilled caption plus the photo. Only published
 * edit rooms have it, since drafts have no live URL yet. */
function initShare(): void {
  const section = maybe("de-share");
  const box = maybe("de-share-text");
  const send = maybe("de-share-send");
  const save = maybe("de-share-photo");
  const copy = maybe("de-share-copy");
  if (
    section === null ||
    box === null ||
    send === null ||
    save === null ||
    copy === null
  ) {
    return;
  }
  const slug = document.getElementById("main")?.dataset.slug ?? "";
  box.addEventListener("input", () => {
    shareDirty = true;
  });
  // Without file sharing, hide the button and show the manual steps.
  if (!canFileShare()) {
    send.hidden = true;
    const hint = maybe("de-share-hint");
    if (hint !== null) {
      hint.textContent =
        "This browser can't share photos directly — save the photo, then post it with the words above.";
    }
  }
  send.addEventListener("click", () => {
    const url = sharePhotoUrl();
    if (url === "") {
      sayShare("No photo to share yet.");
      return;
    }
    sayShare("Opening…");
    const title = maybe("pv-title")?.textContent ?? "Painting";
    window
      .fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`photo ${res.status}`);
        return res.blob();
      })
      .then((blob) =>
        navigator.share({
          files: [
            new File([blob], `${slug === "" ? "painting" : slug}.jpg`, {
              type: blob.type === "" ? "image/jpeg" : blob.type,
            }),
          ],
          title,
          text: box.value,
        }),
      )
      .then(
        () => sayShare("Shared."),
        (err: unknown) => {
          // The share sheet was dismissed.
          if (err instanceof DOMException && err.name === "AbortError") {
            sayShare("");
            return;
          }
          sayShare("That didn't share — save the photo and post it by hand.");
        },
      );
  });
  save.addEventListener("click", () => {
    const url = sharePhotoUrl();
    if (url === "") {
      sayShare("No photo to share yet.");
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug === "" ? "painting" : slug}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    sayShare("Photo saved — post it with the words above.", true);
  });
  copy.addEventListener("click", () => {
    const byHand = () => {
      box.focus();
      box.select();
      sayShare("Couldn't copy — hold the words to copy them by hand.");
    };
    if (typeof navigator.clipboard?.writeText !== "function") {
      byHand();
      return;
    }
    navigator.clipboard
      .writeText(box.value)
      .then(() => sayShare("Copied."), byHand);
  });
  section.hidden = false;
}

function blobToFile(blob: Blob, name: string, type: string): File {
  return new File([blob], name, { type });
}

/** Shows the prepared photo everywhere this room displays one. */
function showPhoto(
  url: string,
  width: number,
  height: number,
  bytes: number,
): void {
  const draftImg = maybe("de-photo-preview");
  if (draftImg !== null) {
    draftImg.src = url;
    draftImg.hidden = false;
    $("de-photo-empty").hidden = true;
    $("de-photo-tools").hidden = false;
  }
  const frameImg = document.querySelector<HTMLImageElement>("#photo-wrap img");
  if (frameImg !== null) {
    // The room photo is a responsive astro:image. Setting src alone leaves
    // the old srcset candidate showing, so clear both first.
    frameImg.removeAttribute("srcset");
    frameImg.removeAttribute("sizes");
    frameImg.src = url;
  }
  const mb = bytes / 1048576;
  const size =
    mb >= 1
      ? `${mb.toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const meta = maybe("de-photo-meta");
  if (meta !== null)
    meta.textContent = `${width} × ${height} px · ${size} upload`;
}

async function ingestPhoto(img: HTMLImageElement): Promise<void> {
  loadedImage = img;
  const prepared = await prepareImage(loadedImage, rotation);
  if (lastPreviewUrl !== null) URL.revokeObjectURL(lastPreviewUrl);
  preparedBlob = prepared.blob;
  photoGen += 1;
  previewModels = null;
  photoReplaced = true;
  lastPreviewUrl = prepared.previewUrl;
  showPhoto(
    prepared.previewUrl,
    prepared.width,
    prepared.height,
    prepared.blob.size,
  );
  void autoBuildAr();
}

function heicHint(file: File): string {
  const name = (file.name ?? "").toLowerCase();
  const heic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif");
  return heic
    ? " This looks like HEIC — iPhones read it, but desktop browsers often don't. Re-upload from the phone or export as JPEG first."
    : "";
}

/** Rebuilds the AR models when the photo, rotation, or dimensions change.
 * Superseded runs exit early, and failures don't block saving. */
async function autoBuildAr(): Promise<void> {
  if (preparedBlob === null) return;
  const want = modelSig();
  if (want !== null && previewModels !== null && previewModels.sig === want)
    return;
  const source = preparedBlob;
  const gen = photoGen;
  const waiting = maybe("de-ar-waiting");
  const stage = maybe("ar-stage");
  if (stage === null) return;
  if (waiting !== null) waiting.hidden = true;
  stage.hidden = false;
  stage.innerHTML =
    '<p class="ar-waiting">Building the 3D preview — about 5 seconds…</p>';
  try {
    const { buildArModels, estimateDims } = await loadArTooling();
    if (gen !== photoGen || preparedBlob !== source) return;
    const arImg = await loadImageFile(
      blobToFile(source, "ar-source.jpg", "image/jpeg"),
    );
    const { widthIn, heightIn, depthIn } = readDims();
    const dims = estimateDims(arImg, widthIn, heightIn, depthIn);
    const models = await buildArModels(arImg, dims.w, dims.h, dims.d);
    if (gen !== photoGen || preparedBlob !== source) return;
    const sig = modelSig();
    previewModels =
      sig === null ? null : { sig, glb: models.glb, usdz: models.usdz };
    showArViewer(
      URL.createObjectURL(models.glb),
      URL.createObjectURL(models.usdz),
    );
  } catch (err) {
    if (gen !== photoGen || preparedBlob !== source) return;
    previewModels = null;
    stage.innerHTML =
      '<p class="ar-waiting">The 3D preview didn\u2019t build — you can still save without it.</p>';
    console.error(err);
  }
}

/** Inline AR viewer for checking the wall preview before publishing. */
function showArViewer(glbUrl: string, usdzUrl: string): void {
  const stage = maybe("ar-stage");
  if (stage === null) return;
  void loadModelViewer()
    .then(() => {
      if (!document.contains(stage)) return;
      const title = $("de-title").value.trim();
      const alt = $("de-alt").value.trim();
      // Typed through HTMLElementTagNameMap in client-globals.d.ts.
      const el = document.createElement("model-viewer");
      el.setAttribute("src", glbUrl);
      el.setAttribute("ios-src", usdzUrl);
      el.setAttribute("ar", "");
      el.setAttribute("ar-modes", "webxr scene-viewer quick-look");
      el.setAttribute("ar-scale", "fixed");
      el.setAttribute("ar-placement", "wall");
      el.setAttribute("camera-controls", "");
      // Vertical swipes scroll the page, and horizontal drags rotate the
      // model. Otherwise phones capture the scroll.
      el.setAttribute("touch-action", "pan-y");
      el.setAttribute("alt", alt === "" ? title : alt);
      el.style.width = "100%";
      el.style.height = "20rem";
      el.style.borderRadius = "1rem";
      stage.replaceChildren(el);
    })
    .catch(() => {
      stage.innerHTML =
        '<p class="ar-waiting">The 3D preview didn\u2019t build — you can still save without it.</p>';
    });
}

function buzz(): void {
  try {
    if (typeof navigator.vibrate === "function") navigator.vibrate(10);
  } catch {
    // ignore
  }
}

/** Stores a confirmation toast for the dashboard, then navigates there. */
function goAdmin(flash: string): void {
  try {
    window.sessionStorage.setItem("studio-flash", flash);
  } catch {
    // ignore
  }
  // Saved or deleted, so the autosave backup is no longer needed.
  try {
    const key = roomKey();
    if (key !== null) window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
  window.location.href = "/admin";
}

/** Notifies the checked channels after a publish. Drafts and plain saves
 * don't notify. Failures are reported in the confirmation text rather than
 * failing the publish. */
async function publishAlerts(): Promise<string> {
  const push = maybe("de-notify-push")?.checked ?? false;
  const email = maybe("de-notify-email")?.checked ?? false;
  if (!push && !email) return "";
  try {
    // One Worker call only reaches about 40 browsers, so pushes are paged
    // by cursor. The email goes out once, with the first batch.
    const r = await api.notifyCollectors({ push, email });
    let sent = r.sent;
    let cursor = r.nextCursor;
    while (push && cursor !== null && cursor !== undefined) {
      const next = await api.notifyCollectors({ push, email: false, cursor });
      sent += next.sent;
      cursor = next.nextCursor;
    }
    const bits: string[] = [];
    if (push) bits.push(`Notified ${sent} of ${r.total} subscribers.`);
    if (email) {
      bits.push(
        r.emailTotal === 0
          ? "Email list is empty."
          : r.emailed
            ? `Emailed ${r.emailTotal}.`
            : "Email not sent (mail isn't set up).",
      );
    }
    return ` ${bits.join(" ")}`;
  } catch (err) {
    return ` Couldn't send the alerts: ${errorMessage(err)}`;
  }
}

interface FieldSet {
  title: string;
  price: number;
  alt: string;
  description: string;
  medium: string;
  widthIn: number | null;
  heightIn: number | null;
  depthIn: number | null;
  sold: boolean;
  /** Scheduled go-live ("YYYY-MM-DD", "" when none). */
  publishOn: string;
}

function readFields(): FieldSet | null {
  const title = $("de-title").value.trim();
  const price = Number($("de-price").value);
  if (title === "" || !(Number.isFinite(price) && price > 0)) {
    setStatus("Title and a valid price are required.", true);
    return null;
  }
  return {
    title,
    price,
    alt: $("de-alt").value.trim(),
    description: $("de-desc").value.trim(),
    medium: $("de-medium").value.trim(),
    ...readDims(),
    sold: $("de-sold").checked,
    publishOn: normalizePublishOn($("de-publish-on").value),
  };
}

/** Autosaves form input so it survives a refresh or crash. Photos aren't
 * included. Cleared on save or delete. */
let autosaveTimer = 0;

/** Debounces model rebuilds for dimension typing, so "20" builds once.
 * Photo and rotation changes rebuild immediately. */
let arBuildTimer = 0;

function scheduleArBuild(): void {
  window.clearTimeout(arBuildTimer);
  arBuildTimer = window.setTimeout(() => {
    if (preparedBlob !== null) void autoBuildAr();
  }, 900);
}

function autosaveKey(mode: string, slug: string, mdPath: string): string {
  return `studio-autosave-v1|${mode}|${slug}|${mdPath}`;
}

function roomKey(): string | null {
  const main = document.getElementById("main");
  if (main === null) return null;
  const mode = studioMode(main);
  if (mode === null) return null;
  return autosaveKey(mode, main.dataset.slug ?? "", main.dataset.mdPath ?? "");
}

/** Raw input values as typed, or null outside a painting room. */
function snapshotInputs(): Record<string, string | boolean> | null {
  const title = maybe("de-title");
  const price = maybe("de-price");
  const medium = maybe("de-medium");
  const alt = maybe("de-alt");
  const desc = maybe("de-desc");
  const w = maybe("de-w");
  const h = maybe("de-h");
  const d = maybe("de-d");
  const sold = maybe("de-sold");
  const publishOn = maybe("de-publish-on");
  if (
    title === null ||
    price === null ||
    medium === null ||
    alt === null ||
    desc === null ||
    w === null ||
    h === null ||
    d === null ||
    sold === null ||
    publishOn === null
  ) {
    return null;
  }
  return {
    title: title.value,
    price: price.value,
    medium: medium.value,
    alt: alt.value,
    desc: desc.value,
    w: w.value,
    h: h.value,
    d: d.value,
    sold: sold.checked,
    publishOn: publishOn.value,
  };
}

function scheduleAutosave(): void {
  window.clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(() => {
    try {
      const key = roomKey();
      const snap = snapshotInputs();
      if (key === null || snap === null) return;
      window.localStorage.setItem(
        key,
        JSON.stringify({ ...snap, savedAt: Date.now() }),
      );
    } catch {
      // Storage is full or blocked. Saving still works.
    }
  }, 800);
}

/** Restores this room's autosave when it differs from the file, then
 * refreshes the preview. Backups older than a day or without a timestamp
 * are discarded instead. */
function restoreAutosave(): void {
  let raw: string | null;
  let key: string | null;
  try {
    key = roomKey();
    raw = key === null ? null : window.localStorage.getItem(key);
  } catch {
    return;
  }
  if (raw === null || key === null) return;
  const next = readBackup(raw, Date.now());
  if (next === null) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Storage is blocked, so there's nothing to clean up.
    }
    return;
  }
  const snap = snapshotInputs();
  if (snap === null) return;
  let differs = false;
  for (const k of Object.keys(next)) {
    if (k === "savedAt") continue;
    if (snap[k] !== next[k as keyof typeof next]) {
      differs = true;
      break;
    }
  }
  if (!differs) return;
  const set = (id: string, v: string | boolean): void => {
    const el = maybe(id);
    if (el === null) return;
    if (typeof v === "boolean") {
      if (el instanceof HTMLInputElement) el.checked = v;
    } else if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement
    ) {
      el.value = v;
    }
  };
  set("de-title", next["title"] ?? "");
  set("de-price", next["price"] ?? "");
  set("de-medium", next["medium"] ?? "");
  set("de-alt", next["alt"] ?? "");
  set("de-desc", next["desc"] ?? "");
  set("de-w", next["w"] ?? "");
  set("de-h", next["h"] ?? "");
  set("de-d", next["d"] ?? "");
  set("de-sold", next["sold"] ?? false);
  set("de-publish-on", next["publishOn"] ?? "");
  refreshPreview();
}

/** Model blobs for the current photo and dimensions. Builds them only when
 * the preview doesn't already have matching ones. */
async function modelBlobs(): Promise<{ glb: Blob; usdz: Blob } | null> {
  const want = modelSig();
  if (want !== null && previewModels !== null && previewModels.sig === want) {
    return { glb: previewModels.glb, usdz: previewModels.usdz };
  }
  if (preparedBlob === null) return null;
  setStatus("Building wall preview… (true size, about 5 seconds)");
  try {
    const { buildArModels, estimateDims } = await loadArTooling();
    const source = preparedBlob;
    const arImg = await loadImageFile(
      blobToFile(source, "ar-source.jpg", "image/jpeg"),
    );
    const { widthIn, heightIn, depthIn } = readDims();
    const dims = estimateDims(arImg, widthIn, heightIn, depthIn);
    const models = await buildArModels(arImg, dims.w, dims.h, dims.d);
    const sig = modelSig();
    previewModels =
      sig === null ? null : { sig, glb: models.glb, usdz: models.usdz };
    return { glb: models.glb, usdz: models.usdz };
  } catch (err) {
    console.error(err);
    setStatus("Wall preview build failed — saving without it.", true);
    return null;
  }
}

/** Page URLs come from titles, so duplicate titles are rejected. */
async function titleClash(
  title: string,
  ownSlug: string | null,
): Promise<boolean> {
  if (isTitleTaken(await existingTitles(), title, ownSlug)) {
    setStatus(
      `Another painting is already called "${title}" — give this one its own title.`,
      true,
    );
    return true;
  }
  return false;
}

/** Commits a new painting, as a draft or published, and returns to /admin. */
async function saveNew(draft: boolean): Promise<void> {
  const fields = readFields();
  if (fields === null) return;
  if (preparedBlob === null) {
    setStatus("Choose a photo first.", true);
    return;
  }
  if (await titleClash(fields.title, null)) return;
  if (!draft && !confirmPublish(fields.title)) return;
  if (await useOverlayMode()) {
    const slug =
      slugifyTitle(fields.title) === ""
        ? "untitled"
        : slugifyTitle(fields.title);
    const practice: PracticePainting = {
      slug,
      title: fields.title,
      price: Math.round(fields.price * 100) / 100,
      sold: fields.sold,
      alt: fields.alt,
      description: fields.description,
      widthIn: fields.widthIn === null ? "" : String(fields.widthIn),
      heightIn: fields.heightIn === null ? "" : String(fields.heightIn),
      depthIn: fields.depthIn === null ? "" : String(fields.depthIn),
      medium: fields.medium,
      draft,
      publishOn: draft ? fields.publishOn : "",
    };
    practiceUpsert(practice);
    buzz();
    goAdmin(
      draft
        ? `Draft "${fields.title}" kept in this tab's practice list — publish it on the live site.`
        : `Practice save of "${fields.title}" kept in this tab — publish it on the live site.`,
    );
    return;
  }
  setStatus(
    draft
      ? "Saving draft…"
      : "Publishing… (photo, page, and preview in one commit)",
  );
  try {
    const slug = await uniqueSlug(fields.title);
    const imageFile = `${slug}.jpg`;
    const models = await modelBlobs();
    const files: Array<{ path: string; blob: Blob | string }> = [
      {
        path: `src/content/paintings/${slug}.md`,
        blob: buildMarkdown({
          title: fields.title,
          price: fields.price,
          alt: fields.alt,
          description: fields.description,
          imageFile,
          widthIn: fields.widthIn,
          heightIn: fields.heightIn,
          depthIn: fields.depthIn,
          medium: fields.medium,
          draft,
          // Publishing goes live now. A date only applies to drafts, as
          // the scheduled publish date.
          publishOn: draft ? fields.publishOn : "",
          modelGlb: models === null ? "" : `/models/${slug}.glb`,
          modelUsdz: models === null ? "" : `/models/${slug}.usdz`,
        }),
      },
      { path: `src/content/paintings/${imageFile}`, blob: preparedBlob },
    ];
    if (models !== null) {
      files.push(
        { path: `public/models/${slug}.glb`, blob: models.glb },
        { path: `public/models/${slug}.usdz`, blob: models.usdz },
      );
    }
    await api.commitFiles(
      draft ? `Save draft: ${fields.title}` : `Add painting: ${fields.title}`,
      files,
    );
    buzz();
    const priceCents = Math.round(fields.price * 100);
    const alerts = draft ? "" : await publishAlerts();
    const scheduled = draft && fields.publishOn !== "";
    goAdmin(
      scheduled
        ? `Draft "${fields.title}" saved — goes live ${fields.publishOn}.`
        : draft
          ? `Draft "${fields.title}" saved — publish it from the studio when ready.`
          : `Published "${fields.title}" (${formatCAD(priceCents)}) — live in a few minutes.${alerts}`,
    );
  } catch (err) {
    setStatus(errorMessage(err), true);
  }
}

/** On rename, adds the old slug to slugHistory so old links still work. */
function renamedHistory(
  base: ParsedPainting,
  oldSlug: string,
  title: string,
): string | undefined {
  const next = slugifyTitle(title);
  if (next === "" || next === oldSlug) return undefined;
  return appendSlugHistory(base.slugHistory, oldSlug);
}

/** Base file for the edit room: repo content, or practice values in dev. */
async function loadEditBase(
  mdPath: string,
): Promise<{ content: string; parsed: ParsedPainting } | null> {
  try {
    const content = await api.getPaintingFile(mdPath);
    if (content === null) return null;
    const parsed = parsePainting(content);
    return parsed === null ? null : { content, parsed };
  } catch {
    return null;
  }
}

function practiceFromInputs(slug: string, draft: boolean): PracticePainting {
  const fields = readFields() ?? {
    title: "",
    price: 0,
    alt: "",
    description: "",
    medium: "",
    widthIn: null,
    heightIn: null,
    depthIn: null,
    sold: false,
    publishOn: "",
  };
  return {
    slug,
    title: fields.title,
    price: fields.price,
    sold: fields.sold,
    alt: fields.alt,
    description: fields.description,
    widthIn: fields.widthIn === null ? "" : String(fields.widthIn),
    heightIn: fields.heightIn === null ? "" : String(fields.heightIn),
    depthIn: fields.depthIn === null ? "" : String(fields.depthIn),
    medium: fields.medium,
    draft,
    publishOn: fields.publishOn,
  };
}

/** Saves the open painting. A new photo replaces the file in place, so
 * links keep working. */
async function saveEdit(
  slug: string,
  mdPath: string,
  base: { content: string; parsed: ParsedPainting } | null,
  draft: boolean,
): Promise<void> {
  const fields = readFields();
  if (fields === null) return;
  if ((await useOverlayMode()) || base === null) {
    if (base === null && !(await useOverlayMode())) {
      setStatus("Couldn't load this painting's file.", true);
      return;
    }
    practiceUpsert({
      ...practiceFromInputs(slug, draft),
      title: fields.title,
      price: fields.price,
    });
    buzz();
    goAdmin(
      `Saved "${fields.title}" in this tab's practice list — publish it on the live site.`,
    );
    return;
  }
  if (await titleClash(fields.title, slug)) return;
  setStatus("Saving… (live in a few minutes)");
  try {
    const imageFile =
      base.parsed.image === "" ? `${slug}.jpg` : base.parsed.image;
    const files: Array<{ path: string; blob: Blob | string }> = [];
    const edits: PaintingEdits = {
      title: fields.title,
      price: fields.price.toFixed(2),
      alt: fields.alt,
      description: fields.description,
      widthIn: fields.widthIn === null ? "" : String(fields.widthIn),
      heightIn: fields.heightIn === null ? "" : String(fields.heightIn),
      depthIn: fields.depthIn === null ? "" : String(fields.depthIn),
      medium: fields.medium,
      draft,
      sold: fields.sold,
      publishOn: fields.publishOn,
      slugHistory: renamedHistory(base.parsed, slug, fields.title),
    };
    if (photoReplaced && preparedBlob !== null) {
      // New photo: build its models and commit everything together.
      const models = await modelBlobs();
      const glbRef =
        base.parsed.modelGlb !== ""
          ? base.parsed.modelGlb
          : `/models/${slug}.glb`;
      const usdzRef =
        base.parsed.modelUsdz !== ""
          ? base.parsed.modelUsdz
          : `/models/${slug}.usdz`;
      files.push(
        {
          path: mdPath,
          blob: patchPainting(base.content, {
            ...edits,
            modelGlb: models === null ? "" : glbRef,
            modelUsdz: models === null ? "" : usdzRef,
          }),
        },
        { path: `src/content/paintings/${imageFile}`, blob: preparedBlob },
      );
      if (models !== null) {
        const stem = (ref: string): string => ref.replace(/^\/models\//, "");
        files.push(
          { path: `public/models/${stem(glbRef)}`, blob: models.glb },
          { path: `public/models/${stem(usdzRef)}`, blob: models.usdz },
        );
      }
    } else {
      // Same photo: dimension changes rebuild the models from the repo file.
      const { rebuildForDimFix } = await import("../lib/vendor-loader").then(
        (m) => m.loadArTooling(),
      );
      const fix = await rebuildForDimFix(
        api.getPhoto,
        mdPath,
        base.parsed,
        edits,
        () =>
          setStatus("Rebuilding wall preview… (true size, about 5 seconds)"),
      );
      files.push(
        { path: mdPath, blob: patchPainting(base.content, fix.edits) },
        ...fix.files,
      );
      if (fix.note !== null) {
        setStatus(`Saved "${fields.title}" — but ${fix.note}`, true);
        return;
      }
    }
    await api.commitFiles(`Edit painting: ${fields.title}`, files);
    buzz();
    goAdmin(`Saved "${fields.title}" — live in a few minutes.`);
  } catch (err) {
    setStatus(errorMessage(err), true);
  }
}

/** Wires delete behind a confirmation modal. The confirm button stays
 * disabled for 3.5 seconds so the warning gets read. */
function wireDelete(
  btnId: string,
  getTitle: () => string,
  doDelete: () => Promise<void>,
): void {
  // The id is a parameter, not a literal, so narrow by element type.
  const btn = maybeButton(btnId);
  const overlay = maybe("de-confirm");
  const body = maybe("de-confirm-body");
  const no = maybe("de-confirm-no");
  const yes = maybe("de-confirm-yes");
  if (btn === null || overlay === null || no === null || yes === null) return;
  let timer: number | null = null;

  const close = () => {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    overlay.hidden = true;
    btn.focus();
  };
  const open = () => {
    if (body !== null) {
      body.textContent =
        `This removes "${getTitle()}" from the site. ` +
        `Anything in trash restores in one tap, for 30 days.`;
    }
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
        yes.textContent = "Move to trash";
        return;
      }
      yes.textContent = `Move to trash (${Math.max(1, Math.floor(left / 1000))})`;
    };
    tick();
    timer = window.setInterval(tick, 250);
    no.focus();
  };

  btn.addEventListener("click", open);
  no.addEventListener("click", close);
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    // Trap Tab between the modal's two buttons.
    if (e.key === "Tab") {
      e.preventDefault();
      (document.activeElement === no ? yes : no).focus();
    }
  });
  yes.addEventListener("click", () => {
    if (yes.disabled) return;
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    overlay.hidden = true;
    btn.disabled = true;
    setStatus(`Moving "${getTitle()}" to trash…`);
    void doDelete().catch((err: unknown) => {
      btn.disabled = false;
      setStatus(errorMessage(err), true);
    });
  });
}

function initStudio(): void {
  const main = document.getElementById("main");
  if (main === null) return;
  // studioMode narrows data-mode to the studio rooms, so a renamed mode
  // fails here rather than downstream.
  const mode = studioMode(main);
  if (mode === null) return;
  const key = `${mode}|${main.dataset.slug ?? ""}|${main.dataset.mdPath ?? ""}`;
  if (main.dataset.studioWired === key) return;
  main.dataset.studioWired = key;
  // Reset photo state, since View Transitions can revisit a room.
  loadedImage = null;
  preparedBlob = null;
  photoGen += 1;
  previewModels = null;
  photoReplaced = false;
  if (lastPreviewUrl !== null) URL.revokeObjectURL(lastPreviewUrl);
  lastPreviewUrl = null;
  rotation = 0;
  shareDirty = false;

  refreshPreview();
  restoreAutosave();
  initShare();
  for (const id of [
    "de-title",
    "de-price",
    "de-medium",
    "de-alt",
    "de-desc",
    "de-sold",
    "de-publish-on",
  ]) {
    $(id).addEventListener("input", () => {
      refreshPreview();
      scheduleAutosave();
    });
  }
  for (const id of ["de-w", "de-h", "de-d"]) {
    $(id).addEventListener("input", () => {
      refreshPreview();
      scheduleAutosave();
      scheduleArBuild();
    });
  }

  const draftInput = maybe("de-photo");
  draftInput?.addEventListener("change", () => {
    const file = draftInput.files?.[0];
    if (file === undefined) return;
    rotation = 0;
    loadImageFile(file)
      .then((img) => ingestPhoto(img))
      .catch((err: unknown) =>
        setStatus(`${errorMessage(err)}.${heicHint(file)}`, true),
      );
  });
  for (const deg of [90, 270] as const) {
    maybe(`de-rotate-${deg}`)?.addEventListener("click", () => {
      // Enumerate the quarter turns instead of casting, so a new rotation
      // step fails to compile here.
      const next = (rotation + deg) % 360;
      rotation = next === 0 ? 0 : next === 90 ? 90 : next === 180 ? 180 : 270;
      if (loadedImage === null) return;
      prepareImage(loadedImage, rotation)
        .then(async (prepared) => {
          if (lastPreviewUrl !== null) URL.revokeObjectURL(lastPreviewUrl);
          preparedBlob = prepared.blob;
          photoGen += 1;
          previewModels = null;
          photoReplaced = true;
          lastPreviewUrl = prepared.previewUrl;
          showPhoto(
            prepared.previewUrl,
            prepared.width,
            prepared.height,
            prepared.blob.size,
          );
          await autoBuildAr();
        })
        .catch((err: unknown) => setStatus(errorMessage(err), true));
    });
  }

  if (mode === "draft") {
    // Clicking the preview title or price focuses its field.
    for (const [pvId, fieldId, name] of [
      ["pv-title", "de-title", "title"],
      ["pv-price", "de-price", "price"],
    ] as const) {
      const pv = maybe(pvId);
      const field = maybe(fieldId);
      if (pv === null || field === null) continue;
      pv.tabIndex = 0;
      pv.title = `Edit the ${name} below`;
      pv.addEventListener("click", () => field.focus());
      pv.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          field.focus();
        }
      });
    }
    maybe("de-save-draft")?.addEventListener("click", () => void saveNew(true));
    maybe("de-publish")?.addEventListener("click", () => void saveNew(false));
    return;
  }

  // Edit room.
  const slug = main.dataset.slug ?? "";
  const mdPath = main.dataset.mdPath ?? "";
  const draft = (main.dataset.draft ?? "") === "1";
  const replaceBtn = maybe("de-replace");
  const replaceFile = maybe("de-replace-file");
  replaceBtn?.addEventListener("click", () => replaceFile?.click());
  replaceFile?.addEventListener("change", () => {
    const file = replaceFile.files?.[0];
    if (file === undefined) return;
    rotation = 0;
    loadImageFile(file)
      .then((img) => ingestPhoto(img))
      .catch((err: unknown) =>
        setStatus(`${errorMessage(err)}.${heicHint(file)}`, true),
      );
  });

  // Wire the buttons now while the file loads. If it fails to load outside
  // dev practice, the buttons are disabled.
  const basePromise = loadEditBase(mdPath);
  void basePromise.then((base) => {
    if (base === null && !isLocalPreview()) {
      setStatus("Couldn't load this painting's file.", true);
      // `as const` lets maybe() resolve each id to HTMLButtonElement.
      for (const id of ["de-save", "de-visibility", "de-del"] as const) {
        const b = maybe(id);
        if (b !== null) b.disabled = true;
      }
    }
  });
  maybe("de-save")?.addEventListener(
    "click",
    () => void basePromise.then((base) => saveEdit(slug, mdPath, base, draft)),
  );
  maybe("de-visibility")?.addEventListener(
    "click",
    () =>
      void basePromise.then(async (base) => {
        const fields = readFields();
        if (fields === null) return;
        // Publishing asks first, as in the new room. Unpublishing doesn't.
        if (draft && !confirmPublish(fields.title)) return;
        if ((await useOverlayMode()) || base === null) {
          if (base === null && !(await useOverlayMode())) {
            setStatus("Couldn't load this painting's file.", true);
            return;
          }
          practiceUpsert({
            ...practiceFromInputs(slug, !draft),
            title: fields.title,
          });
          buzz();
          goAdmin(
            draft
              ? `Published "${fields.title}" in this tab's practice list.`
              : `Unpublished "${fields.title}" in this tab's practice list.`,
          );
          return;
        }
        setStatus(draft ? "Publishing…" : "Unpublishing…");
        patchFlipDraft(mdPath, base, slug, !draft, fields)
          .then(async () => {
            buzz();
            const alerts = draft ? await publishAlerts() : "";
            goAdmin(
              draft
                ? `Published "${fields.title}" — live in a few minutes.${alerts}`
                : `Unpublished "${fields.title}" — off the site in a few minutes.`,
            );
          })
          .catch((err: unknown) => setStatus(errorMessage(err), true));
      }),
  );
  wireDelete(
    "de-del",
    () => $("de-title").value.trim(),
    async () => {
      if (await useOverlayMode()) {
        practiceDelete(slug);
        buzz();
        goAdmin(
          "Deleted from this tab's practice list — the real file is untouched.",
        );
        return;
      }
      const base = await basePromise;
      if (base === null) throw new Error("Couldn't load this painting's file.");
      const parsed = parsePainting(base.content) ?? base.parsed;
      await api.commitFiles(`Move to trash: ${parsed.title}`, [
        { path: mdPath, blob: setTrash(base.content, true, todayKey()) },
      ]);
      buzz();
      goAdmin(
        `Moved "${parsed.title}" to trash — 30 days to change your mind.`,
      );
    },
  );
}

/** Toggles the draft flag and saves the other fields as typed. */
async function patchFlipDraft(
  mdPath: string,
  base: { content: string; parsed: ParsedPainting },
  oldSlug: string,
  draft: boolean,
  fields: FieldSet,
): Promise<void> {
  const edits: PaintingEdits = {
    title: fields.title,
    price: fields.price.toFixed(2),
    alt: fields.alt,
    description: fields.description,
    widthIn: fields.widthIn === null ? "" : String(fields.widthIn),
    heightIn: fields.heightIn === null ? "" : String(fields.heightIn),
    depthIn: fields.depthIn === null ? "" : String(fields.depthIn),
    medium: fields.medium,
    draft,
    sold: fields.sold,
    // Publishing clears the schedule. Unpublishing keeps it.
    publishOn: draft ? fields.publishOn : "",
    slugHistory: renamedHistory(base.parsed, oldSlug, fields.title),
  };
  await api.commitFiles(`Edit painting: ${fields.title}`, [
    { path: mdPath, blob: patchPainting(base.content, edits) },
  ]);
}

initStudio();
document.addEventListener("astro:page-load", initStudio);
