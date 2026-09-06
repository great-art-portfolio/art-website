/**
 * Browser-side photo prep — plain TypeScript + Canvas, no Rust/WASM needed.
 * Phone photos get downscaled to a web-friendly size, rotated/straightened,
 * and exported as JPEG. Heavy lifting (thumbnails at build time) stays with
 * sharp; no ffmpeg — there is no video or audio in this pipeline.
 */

export interface PreparedImage {
  blob: Blob;
  previewUrl: string;
  width: number;
  height: number;
}

export const MAX_SIDE = 2000;
export const JPEG_QUALITY = 0.85;

export async function loadImageFile(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not read that photo"));
      img.src = url;
    });
    return img;
  } finally {
    // Revoked after load; the element keeps its decoded pixels.
    URL.revokeObjectURL(url);
  }
}

/**
 * Pure output-size math behind drawPrepared — numbers in, numbers out,
 * so rotation + downscale is unit-testable without a browser/DOM.
 */
export function scaleFor(
  naturalWidth: number,
  naturalHeight: number,
  rotationDeg: 0 | 90 | 180 | 270,
): { width: number; height: number } {
  const rotated = rotationDeg === 90 || rotationDeg === 270;
  const srcW = rotated ? naturalHeight : naturalWidth;
  const srcH = rotated ? naturalWidth : naturalHeight;
  const scale = Math.min(1, MAX_SIDE / Math.max(srcW, srcH));
  return { width: Math.round(srcW * scale), height: Math.round(srcH * scale) };
}

function drawPrepared(
  img: HTMLImageElement,
  rotationDeg: 0 | 90 | 180 | 270,
): { canvas: HTMLCanvasElement; width: number; height: number } {
  const { width, height } = scaleFor(
    img.naturalWidth,
    img.naturalHeight,
    rotationDeg,
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("Canvas is not available in this browser");
  ctx.translate(width / 2, height / 2);
  ctx.rotate((rotationDeg * Math.PI) / 180);
  const drawW = rotationDeg % 180 === 0 ? width : height;
  const drawH = rotationDeg % 180 === 0 ? height : width;
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  return { canvas, width, height };
}

export async function prepareImage(
  img: HTMLImageElement,
  rotationDeg: 0 | 90 | 180 | 270 = 0,
): Promise<PreparedImage> {
  const { canvas, width, height } = drawPrepared(img, rotationDeg);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) =>
        result === null ? reject(new Error("Export failed")) : resolve(result),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
  return { blob, previewUrl: URL.createObjectURL(blob), width, height };
}
