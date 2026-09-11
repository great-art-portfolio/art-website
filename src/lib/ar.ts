/** AR models from a painting photo: the photo becomes the face of a
 * true-scale framed box (GLB + USDZ). Built on her phone at upload. */
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { USDZExporter } from "three/addons/exporters/USDZExporter.js";
import type { PaintingEdits, ParsedPainting } from "./painting-edit";

const IN_TO_M = 0.0254;
// 1024px is plenty: the preview is a flat painting viewed from feet away
// (a 20rem inline box, or a wall across the room), and anything finer
// never resolves on screen — it only inflates every painting page.
const MAX_TEX_SIDE = 1024;

export interface ArModels {
  glb: Blob;
  usdz: Blob;
}

function textureCanvas(source: HTMLImageElement): HTMLCanvasElement {
  const scale = Math.min(
    1,
    MAX_TEX_SIDE / Math.max(source.naturalWidth, source.naturalHeight),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("Canvas is not available in this browser");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Pure dims geometry (testable without a browser). Missing tape falls back
 * to the photo's aspect at 24 in wide. */
export function resolveDims(
  imgW: number,
  imgH: number,
  widthIn: number | null,
  heightIn: number | null,
  depthIn: number | null,
): { w: number; h: number; d: number } {
  const w = widthIn ?? 24;
  const h = heightIn ?? (w * imgH) / Math.max(1, imgW);
  return { w, h, d: depthIn ?? 1.5 };
}

/** Missing tape measurements fall back to the photo's aspect at 24 in wide. */
export function estimateDims(
  img: HTMLImageElement,
  widthIn: number | null,
  heightIn: number | null,
  depthIn: number | null,
): { w: number; h: number; d: number } {
  return resolveDims(
    img.naturalWidth,
    img.naturalHeight,
    widthIn,
    heightIn,
    depthIn,
  );
}

/** Decode repo photo bytes (from the photo endpoint) into an <img>. */
export function loadImageBlob(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that photo."));
    };
    img.src = url;
  });
}

export async function buildArModels(
  img: HTMLImageElement,
  widthIn: number,
  heightIn: number,
  depthIn: number,
): Promise<ArModels> {
  const w = widthIn * IN_TO_M;
  const h = heightIn * IN_TO_M;
  const d = depthIn * IN_TO_M;

  const texture = new THREE.CanvasTexture(textureCanvas(img));
  texture.colorSpace = THREE.SRGBColorSpace;
  // JPEG in both exporters — measured ~7x smaller than the default PNG
  // for these photos (first-thaw: 267KB JPEG vs 1.9MB PNG at 1012x1024).
  // PNG would make every painting page download megabytes of model.
  texture.userData.mimeType = "image/jpeg";

  const art = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 });
  const frame = new THREE.MeshStandardMaterial({
    color: 0x1c1a17,
    roughness: 0.6,
  });
  const scene = new THREE.Scene();
  // Frame box + art plane a hair in front (multi-material boxes trip USDZ).
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frame));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), art);
  face.position.z = d / 2 + 0.001;
  scene.add(face);

  const gltf = new GLTFExporter();
  const glbResult = await gltf.parseAsync(scene, {
    binary: true,
  });
  // Binary export resolves an ArrayBuffer; anything else is a failed
  // export, not a model — narrow instead of casting.
  if (!(glbResult instanceof ArrayBuffer)) {
    throw new Error("The 3D preview didn't build.");
  }
  const glbBuf = glbResult;

  const usdz = new USDZExporter();
  const anchor = {
    quickLookCompatible: true,
    ar: {
      anchoring: { type: "plane" as const },
      planeAnchoring: { alignment: "vertical" as const },
    },
  };
  let usdzBuf: Uint8Array;
  try {
    usdzBuf = await usdz.parseAsync(scene, anchor);
  } catch {
    // Anchorless, never floor-anchored: without the wall pin Quick Look
    // opens the painting upright in object mode; the exporter's default
    // is a horizontal anchor, which would lay it flat.
    usdzBuf = await usdz.parseAsync(scene, {
      includeAnchoringProperties: false,
      quickLookCompatible: true,
    });
  }

  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.geometry.dispose();
    for (const m of Array.isArray(obj.material)
      ? obj.material
      : [obj.material]) {
      m.dispose();
    }
  });
  texture.dispose();

  return {
    glb: new Blob([glbBuf], { type: "model/gltf-binary" }),
    // Exact-length copy: the exporter's view may sit in a larger buffer.
    usdz: new Blob([usdzBuf.slice()], { type: "model/vnd.usdz" }),
  };
}

export interface RebuiltAr {
  files: Array<{ path: string; blob: Blob }>;
  modelGlb: string;
  modelUsdz: string;
}

/** Repo stem for a painting file: src/content/paintings/<stem>.md. */
export function stemOf(mdPath: string): string {
  return mdPath.replace(/^src\/content\/paintings\//, "").replace(/\.md$/, "");
}

function numOrNull(raw: string): number | null {
  const n = Number(raw);
  return raw.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
}

export interface DimFixResult {
  /** Edits with fresh model refs when rebuilt (untouched otherwise). */
  edits: PaintingEdits;
  /** Model files to add to the commit (empty when no rebuild). */
  files: Array<{ path: string; blob: Blob }>;
  rebuilt: boolean;
  /** Why the rebuild was skipped over, for the status line. Null when fine. */
  note: string | null;
}

/** Rebuild AR models when dims changed or none exist. Never throws:
 * failures degrade to a models-free save + note. */
export async function rebuildForDimFix(
  getPhoto: (path: string) => Promise<Blob | null>,
  mdPath: string,
  before: ParsedPainting,
  edits: PaintingEdits,
  onRebuildStart?: () => void,
): Promise<DimFixResult> {
  const prev = {
    w: numOrNull(before.widthIn),
    h: numOrNull(before.heightIn),
    d: numOrNull(before.depthIn),
  };
  // Blank edit fields keep the old value (same rule as patchPainting).
  const next = {
    w: numOrNull(edits.widthIn) ?? prev.w,
    h: numOrNull(edits.heightIn) ?? prev.h,
    d: numOrNull(edits.depthIn) ?? prev.d,
  };
  const changed = next.w !== prev.w || next.h !== prev.h || next.d !== prev.d;
  const missing = before.modelGlb === "" || before.modelUsdz === "";
  if (!changed && !missing)
    return { edits, files: [], rebuilt: false, note: null };
  try {
    if (onRebuildStart !== undefined) onRebuildStart();
    const photoPath =
      before.image === "" ? null : `src/content/paintings/${before.image}`;
    const rebuilt = await rebuildArFiles(
      getPhoto,
      stemOf(mdPath),
      photoPath,
      next,
    );
    return {
      edits: {
        ...edits,
        modelGlb: rebuilt.modelGlb,
        modelUsdz: rebuilt.modelUsdz,
      },
      files: rebuilt.files,
      rebuilt: true,
      note: null,
    };
  } catch (err) {
    return {
      edits,
      files: [],
      rebuilt: false,
      note: err instanceof Error ? err.message : "AR preview wasn't rebuilt.",
    };
  }
}

/** Rebuild AR models from the repo photo. Throws on failure; callers then
 * degrade to a models-free save with a status note. */
export async function rebuildArFiles(
  getPhoto: (path: string) => Promise<Blob | null>,
  stem: string,
  photoPath: string | null,
  dims: { w: number | null; h: number | null; d: number | null },
): Promise<RebuiltAr> {
  if (photoPath === null)
    throw new Error("This painting has no photo to rebuild from.");
  const photo = await getPhoto(photoPath);
  if (photo === null) throw new Error("Couldn't fetch this painting's photo.");
  const img = await loadImageBlob(photo);
  const final = resolveDims(
    img.naturalWidth,
    img.naturalHeight,
    dims.w,
    dims.h,
    dims.d,
  );
  const models = await buildArModels(img, final.w, final.h, final.d);
  const modelGlb = `/models/${stem}.glb`;
  const modelUsdz = `/models/${stem}.usdz`;
  return {
    files: [
      { path: `public/models/${stem}.glb`, blob: models.glb },
      { path: `public/models/${stem}.usdz`, blob: models.usdz },
    ],
    modelGlb,
    modelUsdz,
  };
}
