/** Draft + edit rooms. Both render the shared PaintingDetail layout, so what
 * she edits is what buyers see. Saving commits .md + photo (+ models); dev
 * works against a practice overlay. */
import { api, existingTitles, getApiToken, uniqueSlug } from "../lib/api";
import { loadImageFile, prepareImage } from "../lib/image";

import { dollarsToCents, formatCAD } from "../lib/money";
import { formatDimensions } from "../lib/dims";
import { isTitleTaken, slugifyTitle } from "../lib/site";
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
import { $, maybe, maybeButton, studioMode } from "../lib/dom";
import { errorMessage } from "../lib/errors";
import {
  practiceDelete,
  practiceUpsert,
  type PracticePainting,
} from "../lib/practice";

/** Self-clearing toasts; words fade both ways. One timer covers both phases. */
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

/** Practice overlay unless something real persists: a stored token commits,
 * and under `pnpm dev` the sidecar writes the working tree tokenless. */
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

// Photo state: the prepared upload blob, its rotation, and preview models
// built from exactly these pixels (rebuilt whenever anything changes).
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

/** Live buyer preview while she types: title, price, measurements, words. */
function refreshPreview(): void {
  const title = $("de-title").value.trim();
  const priceRaw = $("de-price").value.trim();
  $("pv-title").textContent = title === "" ? "Untitled" : title;
  const cents = dollarsToCents(Number(priceRaw));
  $("pv-price").textContent = cents === null ? "Price?" : formatCAD(cents);
  const { widthIn, heightIn, depthIn } = readDims();
  const medium = $("de-medium").value.trim();
  const meta = [
    medium === "" ? undefined : medium,
    formatDimensions(widthIn, heightIn, depthIn),
  ]
    .filter((s) => s !== undefined && s !== "")
    .join(" · ");
  $("pv-meta").textContent = meta;
  const raw = $("de-desc").value;
  $("pv-desc").innerHTML = raw
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter((para) => para !== "")
    .map((para) => `<p>${escHtml(para)}</p>`)
    .join("");
  // Alt text never shows on the page, but the preview photos wear it live
  // so what a screen reader announces matches what buyers will hear.
  const altText = $("de-alt").value.trim();
  const liveAlt =
    altText === "" ? ($("pv-title").textContent ?? "Painting") : altText;
  for (const sel of ["#de-photo-preview", "#photo-wrap img"]) {
    const img = document.querySelector<HTMLImageElement>(sel);
    if (img !== null) img.alt = liveAlt;
  }
}

function blobToFile(blob: Blob, name: string, type: string): File {
  return new File([blob], name, { type });
}

/** Show the prepared photo wherever this room displays one. */
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
    // The room photo is a responsive astro:image: assigning src alone
    // leaves the old srcset candidate on screen, so drop both first.
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

/** Rebuild models when photo/rotation/tape change. Stale runs bail; failures
 * never block saving. */
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

/** Inline viewer so she can try the wall preview before buyers do. */
function showArViewer(glbUrl: string, usdzUrl: string): void {
  const stage = maybe("ar-stage");
  if (stage === null) return;
  void loadModelViewer()
    .then(() => {
      if (!document.contains(stage)) return;
      const title = $("de-title").value.trim();
      const alt = $("de-alt").value.trim();
      // Typed via HTMLElementTagNameMap in client-globals — no cast.
      const el = document.createElement("model-viewer");
      el.setAttribute("src", glbUrl);
      el.setAttribute("ios-src", usdzUrl);
      el.setAttribute("ar", "");
      el.setAttribute("ar-modes", "webxr scene-viewer quick-look");
      el.setAttribute("ar-scale", "fixed");
      el.setAttribute("ar-placement", "wall");
      el.setAttribute("camera-controls", "");
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

/** Hand the dashboard its confirmation, then go there. */
function goAdmin(flash: string): void {
  try {
    window.sessionStorage.setItem("studio-flash", flash);
  } catch {
    // ignore
  }
  // Saved (or deleted): the backup served its purpose.
  try {
    const key = roomKey();
    if (key !== null) window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
  window.location.href = "/admin";
}

/** Ping checked channels after a publish (never drafts/saves). Failures ride
 * along in the confirmation instead of failing the publish. */
async function publishAlerts(): Promise<string> {
  const push = maybe("de-notify-push")?.checked ?? false;
  const email = maybe("de-notify-email")?.checked ?? false;
  if (!push && !email) return "";
  try {
    const r = await api.notifyCollectors({ push, email });
    const bits: string[] = [];
    if (push) bits.push(`Notified ${r.sent} of ${r.total} subscribers.`);
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

/** Silent autosave: typing survives refresh/crash (photos excluded). Cleared
 * on every save/delete exit. */
let autosaveTimer = 0;

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

/** Raw input values (strings, exactly as typed) or null off-room. */
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
      window.localStorage.setItem(key, JSON.stringify(snap));
    } catch {
      // Full or blocked storage: the room still saves normally.
    }
  }, 800);
}

/** Restore this room's backup when it differs — silent, then re-preview. */
function restoreAutosave(): void {
  let raw: string | null;
  try {
    const key = roomKey();
    raw = key === null ? null : window.localStorage.getItem(key);
  } catch {
    return;
  }
  if (raw === null) return;
  let saved: unknown;
  try {
    saved = JSON.parse(raw) as unknown;
  } catch {
    return;
  }
  if (typeof saved !== "object" || saved === null) return;
  const snap = snapshotInputs();
  if (snap === null) return;
  const get = (s: unknown): string => (typeof s === "string" ? s : "");
  const rec = saved as Record<string, unknown>;
  const next: Record<string, string | boolean> = {
    title: get(rec["title"]),
    price: get(rec["price"]),
    medium: get(rec["medium"]),
    alt: get(rec["alt"]),
    desc: get(rec["desc"]),
    w: get(rec["w"]),
    h: get(rec["h"]),
    d: get(rec["d"]),
    sold: rec["sold"] === true,
    publishOn: get(rec["publishOn"]),
  };
  let differs = false;
  for (const k of Object.keys(next)) {
    if (snap[k] !== next[k]) {
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

/** Model blobs matching the current photo + tape numbers, building fresh
 * only when the preview doesn't already hold them. */
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

/** Titles own their page links: block duplicate-title saves with plain words. */
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

/** Commit a brand-new painting (draft or published) and head to /admin. */
async function saveNew(draft: boolean): Promise<void> {
  const fields = readFields();
  if (fields === null) return;
  if (preparedBlob === null) {
    setStatus("Choose a photo first.", true);
    return;
  }
  if (await titleClash(fields.title, null)) return;
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
          // "Publish painting" goes live now — a date only ever rides on
          // a draft, where it becomes the scheduled go-live.
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

/** A rename retires the old link into slugHistory (bookmarks keep working). */
function renamedHistory(
  base: ParsedPainting,
  oldSlug: string,
  title: string,
): string | undefined {
  const next = slugifyTitle(title);
  if (next === "" || next === oldSlug) return undefined;
  return appendSlugHistory(base.slugHistory, oldSlug);
}

/** Base file for the edit room: live content, or practice values in dev. */
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

/** Save the open painting (photo replaces bytes in place; links keep working). */
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
      // New photo: build its models now and commit everything together.
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
      // Same photo: dimension fixes rebuild the models from the repo file.
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

/** Delete behind a modal: DELETE stays disabled 3.5s so the words get read. */
function wireDelete(
  btnId: string,
  getTitle: () => string,
  doDelete: () => Promise<void>,
): void {
  // Dynamic id (a parameter, not a literal) — narrow by tag, never a cast.
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
    // Deadline-based, not tick-counted: a stalled tab still arms ~3.5s in.
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
    // Keep tab cycling between the modal's two buttons.
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
  // data-mode is "buy" | "edit" | "draft" in markup — the helper narrows
  // to the studio rooms, so a renamed mode fails here, not downstream.
  const mode = studioMode(main);
  if (mode === null) return;
  const key = `${mode}|${main.dataset.slug ?? ""}|${main.dataset.mdPath ?? ""}`;
  if (main.dataset.studioWired === key) return;
  main.dataset.studioWired = key;
  // Fresh room, fresh photo state (View Transitions can revisit).
  loadedImage = null;
  preparedBlob = null;
  photoGen += 1;
  previewModels = null;
  photoReplaced = false;
  if (lastPreviewUrl !== null) URL.revokeObjectURL(lastPreviewUrl);
  lastPreviewUrl = null;
  rotation = 0;

  refreshPreview();
  restoreAutosave();
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
      if (preparedBlob !== null) void autoBuildAr();
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
      // Quarter turns from a quarter turn stay quarter turns — enumerate
      // instead of casting, so a new rotation step is a compiler error
      // here rather than a tilted preview.
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
    // The preview title and price open their fields — same look, doors.
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

  // Buttons wire up immediately; the file they act on arrives just behind.
  // If it never arrives (and this isn't dev practice), they stand down.
  const basePromise = loadEditBase(mdPath);
  void basePromise.then((base) => {
    if (base === null && !isLocalPreview()) {
      setStatus("Couldn't load this painting's file.", true);
      // Literals, not strings: maybe() resolves each to HTMLButtonElement.
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

/** Flip only the draft flag, keeping every other field as typed. */
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
    // Publishing now drops the schedule; unpublishing keeps the field.
    publishOn: draft ? fields.publishOn : "",
    slugHistory: renamedHistory(base.parsed, oldSlug, fields.title),
  };
  await api.commitFiles(`Edit painting: ${fields.title}`, [
    { path: mdPath, blob: patchPainting(base.content, edits) },
  ]);
}

initStudio();
document.addEventListener("astro:page-load", initStudio);
