/**
 * Studio painting island (client-only): the draft + edit rooms behind
 * /admin/paintings/new and /admin/paintings/[slug]. Both render the shared
 * PaintingDetail layout, so what she edits is what buyers see.
 *
 * Saving commits .md + photo (+ AR models) to git like the old dashboard
 * flows did; after a save or delete she lands back on /admin. In dev
 * (no publishing backend) everything still works against a localStorage
 * practice overlay the dashboard merges into its list.
 */
import { api, getApiToken, uniqueSlug } from "../lib/api";
import { loadImageFile, prepareImage } from "../lib/image";
import { buildCaption } from "../lib/share";
import { dollarsToCents, formatCAD } from "../lib/money";
import { formatDimensions } from "../lib/dims";
import { slugifyTitle } from "../lib/site";
import {
  buildMarkdown,
  paintingFilePaths,
  parsePainting,
  patchPainting,
  type PaintingEdits,
  type ParsedPainting,
} from "../lib/painting-edit";
import { loadArTooling, loadModelViewer } from "../lib/vendor-loader";
import {
  practiceDelete,
  practiceUpsert,
  type PracticePainting,
} from "../lib/practice";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Missing #${id}`);
  return el as T;
};

const maybe = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
  document.getElementById(id) as T | null;

/** Studio toasts clear themselves — errors included. */
let statusTimer = 0;
function setStatus(msg: string, isError = false): void {
  const el = maybe("de-status");
  if (el === null) return;
  el.textContent = msg;
  el.dataset.tone = isError ? "error" : "ok";
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    const live = document.getElementById("de-status");
    if (live !== null) live.textContent = "";
  }, 6000);
}

function isLocalPreview(): boolean {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

/** Dev practice unless she configured publishing: a stored API token means
 * the commit, even on localhost (which is also how the stubbed suites run
 * the live paths). Live hosts never practice — failures surface as errors.
 */
function usePracticeMode(): boolean {
  return isLocalPreview() && getApiToken() === "";
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
    widthIn: numOrNull(($("de-w") as HTMLInputElement).value),
    heightIn: numOrNull(($("de-h") as HTMLInputElement).value),
    depthIn: numOrNull(($("de-d") as HTMLInputElement).value),
  };
}

function modelSig(): string | null {
  if (preparedBlob === null) return null;
  const { widthIn, heightIn, depthIn } = readDims();
  return [photoGen, rotation, widthIn, heightIn, depthIn].map(String).join("|");
}

/** Live buyer preview while she types: title, price, measurements, words. */
function refreshPreview(): void {
  const title = ($("de-title") as HTMLInputElement).value.trim();
  const priceRaw = ($("de-price") as HTMLInputElement).value.trim();
  ($("pv-title") as HTMLElement).textContent =
    title === "" ? "Untitled" : title;
  const cents = dollarsToCents(Number(priceRaw));
  ($("pv-price") as HTMLElement).textContent =
    cents === null ? "Price?" : formatCAD(cents);
  const { widthIn, heightIn, depthIn } = readDims();
  const medium = ($("de-medium") as HTMLInputElement).value.trim();
  const meta = [
    medium === "" ? undefined : medium,
    formatDimensions(widthIn, heightIn, depthIn),
  ]
    .filter((s) => s !== undefined && s !== "")
    .join(" · ");
  ($("pv-meta") as HTMLElement).textContent = meta;
  const raw = ($("de-desc") as HTMLTextAreaElement).value;
  ($("pv-desc") as HTMLElement).innerHTML = raw
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter((para) => para !== "")
    .map((para) => `<p>${escHtml(para)}</p>`)
    .join("");
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
  const draftImg = maybe<HTMLImageElement>("de-photo-preview");
  if (draftImg !== null) {
    draftImg.src = url;
    draftImg.hidden = false;
    ($("de-photo-empty") as HTMLElement).hidden = true;
    ($("de-photo-tools") as HTMLElement).hidden = false;
  }
  const frameImg = document.querySelector<HTMLImageElement>("#photo-wrap img");
  if (frameImg !== null) frameImg.src = url;
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

/** Rebuild the true-size models whenever photo, rotation, or tape numbers
 * change. Stale runs bail; failures keep the waiting box with an honest
 * note and never block saving. */
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
      const title = ($("de-title") as HTMLInputElement).value.trim();
      const alt = ($("de-alt") as HTMLInputElement).value.trim();
      const el = document.createElement(
        "model-viewer",
      ) as unknown as HTMLElement;
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

/** Hand the dashboard its confirmation + share kit, then go there. */
function goAdmin(
  flash: string,
  share?: { title: string; caption: string; pageUrl: string },
): void {
  try {
    window.sessionStorage.setItem("studio-flash", flash);
    if (share !== undefined)
      window.sessionStorage.setItem("studio-share", JSON.stringify(share));
  } catch {
    // ignore
  }
  window.location.href = "/admin";
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
}

function readFields(): FieldSet | null {
  const title = ($("de-title") as HTMLInputElement).value.trim();
  const price = Number(($("de-price") as HTMLInputElement).value);
  if (title === "" || !(Number.isFinite(price) && price > 0)) {
    setStatus("Title and a valid price are required.", true);
    return null;
  }
  return {
    title,
    price,
    alt: ($("de-alt") as HTMLInputElement).value.trim(),
    description: ($("de-desc") as HTMLTextAreaElement).value.trim(),
    medium: ($("de-medium") as HTMLInputElement).value.trim(),
    ...readDims(),
    sold: ($("de-sold") as HTMLInputElement).checked,
  };
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

function shareFor(
  fields: FieldSet,
  priceCents: number,
  pageUrl: string,
): string {
  return buildCaption({
    title: fields.title,
    priceCents,
    alt: fields.alt,
    description: fields.description,
    pageUrl,
    widthIn: fields.widthIn,
    heightIn: fields.heightIn,
    depthIn: fields.depthIn,
  });
}

/** Commit a brand-new painting (draft or published) and head to /admin. */
async function saveNew(draft: boolean): Promise<void> {
  const fields = readFields();
  if (fields === null) return;
  if (preparedBlob === null) {
    setStatus("Choose a photo first.", true);
    return;
  }
  if (usePracticeMode()) {
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
    const pageUrl = `${window.location.origin}/paintings/${slug}`;
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
    goAdmin(
      draft
        ? `Draft "${fields.title}" saved — publish it from the studio when ready.`
        : `Published "${fields.title}" (${formatCAD(priceCents)}) — live in a few minutes.`,
      {
        title: fields.title,
        caption: shareFor(fields, priceCents, pageUrl),
        pageUrl,
      },
    );
  } catch (err) {
    setStatus((err as Error).message, true);
  }
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
  };
}

/** Save the open painting (photo replace commits new bytes at the same
 * image path, so links and models keep working). */
async function saveEdit(
  slug: string,
  mdPath: string,
  base: { content: string; parsed: ParsedPainting } | null,
  draft: boolean,
): Promise<void> {
  const fields = readFields();
  if (fields === null) return;
  if (usePracticeMode() || base === null) {
    if (base === null && !usePracticeMode()) {
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
    setStatus((err as Error).message, true);
  }
}

function wireDelete(
  btnId: string,
  getTitle: () => string,
  doDelete: () => Promise<void>,
): void {
  const btn = maybe<HTMLButtonElement>(btnId);
  if (btn === null) return;
  btn.addEventListener("click", () => {
    if (btn.dataset.armed !== "1") {
      btn.dataset.armed = "1";
      btn.textContent = "Tap again to delete";
      setStatus(
        `This removes "${getTitle()}" from the site. Tap again to confirm.`,
        true,
      );
      return;
    }
    btn.disabled = true;
    setStatus(`Deleting "${getTitle()}"… (gone in a few minutes)`);
    void doDelete().catch((err: unknown) => {
      btn.disabled = false;
      btn.dataset.armed = "";
      btn.textContent = "Delete…";
      setStatus((err as Error).message, true);
    });
  });
}

function initStudio(): void {
  const main = document.getElementById("main");
  if (main === null) return;
  const mode = main.dataset.mode ?? "";
  if (mode !== "edit" && mode !== "draft") return;
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
  for (const id of [
    "de-title",
    "de-price",
    "de-medium",
    "de-desc",
    "de-sold",
  ]) {
    $(id).addEventListener("input", refreshPreview);
  }
  for (const id of ["de-w", "de-h", "de-d"]) {
    $(id).addEventListener("input", () => {
      refreshPreview();
      if (preparedBlob !== null) void autoBuildAr();
    });
  }

  const draftInput = maybe<HTMLInputElement>("de-photo");
  draftInput?.addEventListener("change", () => {
    const file = draftInput.files?.[0];
    if (file === undefined) return;
    rotation = 0;
    loadImageFile(file)
      .then((img) => ingestPhoto(img))
      .catch((err: unknown) =>
        setStatus(`${(err as Error).message}.${heicHint(file)}`, true),
      );
  });
  for (const deg of [90, 270] as const) {
    maybe(`de-rotate-${deg}`)?.addEventListener("click", () => {
      rotation = ((rotation + deg) % 360) as 0 | 90 | 180 | 270;
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
        .catch((err: unknown) => setStatus((err as Error).message, true));
    });
  }

  if (mode === "draft") {
    maybe("de-save-draft")?.addEventListener("click", () => void saveNew(true));
    maybe("de-publish")?.addEventListener("click", () => void saveNew(false));
    return;
  }

  // Edit room.
  const slug = main.dataset.slug ?? "";
  const mdPath = main.dataset.mdPath ?? "";
  const draft = (main.dataset.draft ?? "") === "1";
  const replaceBtn = maybe<HTMLButtonElement>("de-replace");
  const replaceFile = maybe<HTMLInputElement>("de-replace-file");
  replaceBtn?.addEventListener("click", () => replaceFile?.click());
  replaceFile?.addEventListener("change", () => {
    const file = replaceFile.files?.[0];
    if (file === undefined) return;
    rotation = 0;
    loadImageFile(file)
      .then((img) => ingestPhoto(img))
      .catch((err: unknown) =>
        setStatus(`${(err as Error).message}.${heicHint(file)}`, true),
      );
  });

  // Buttons wire up immediately; the file they act on arrives just behind.
  // If it never arrives (and this isn't dev practice), they stand down.
  const basePromise = loadEditBase(mdPath);
  void basePromise.then((base) => {
    if (base === null && !isLocalPreview()) {
      setStatus("Couldn't load this painting's file.", true);
      for (const id of ["de-save", "de-visibility", "de-del"]) {
        const b = maybe<HTMLButtonElement>(id);
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
      void basePromise.then((base) => {
        const fields = readFields();
        if (fields === null) return;
        if (usePracticeMode() || base === null) {
          if (base === null && !usePracticeMode()) {
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
        patchFlipDraft(mdPath, base, !draft, fields)
          .then(() => {
            buzz();
            goAdmin(
              draft
                ? `Published "${fields.title}" — live in a few minutes.`
                : `Unpublished "${fields.title}" — off the site in a few minutes.`,
            );
          })
          .catch((err: unknown) => setStatus((err as Error).message, true));
      }),
  );
  wireDelete(
    "de-del",
    () => ($("de-title") as HTMLInputElement).value.trim(),
    async () => {
      if (usePracticeMode()) {
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
      await api.deleteFiles(
        `Delete painting: ${parsed.title}`,
        paintingFilePaths(mdPath, parsed),
      );
      buzz();
      goAdmin(`Deleted "${parsed.title}" — recoverable from repo history.`);
    },
  );
}

/** Flip only the draft flag, keeping every other field as typed. */
async function patchFlipDraft(
  mdPath: string,
  base: { content: string; parsed: ParsedPainting },
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
  };
  await api.commitFiles(`Edit painting: ${fields.title}`, [
    { path: mdPath, blob: patchPainting(base.content, edits) },
  ]);
}

initStudio();
document.addEventListener("astro:page-load", initStudio);
