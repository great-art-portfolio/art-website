/**
 * Browser-side photo preparation with Canvas. Phone photos are downscaled,
 * rotated, and exported as JPEG. Build-time thumbnails are handled by sharp.
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
    // Safe to revoke after load. The element keeps its decoded pixels.
    URL.revokeObjectURL(url);
  }
}

/**
 * Output-size math for drawPrepared, kept pure so rotation and downscaling
 * can be unit-tested without a DOM.
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

/** A small JPEG data URL of a photo, for the writing helper: 1024px on the
 * long side is plenty to see a painting and keeps the upload ~150 KB. */
export async function smallJpegDataUrl(
  src: Blob,
  maxSide = 1024,
): Promise<string> {
  const bitmap = await createImageBitmap(src);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("Could not read that photo");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.8);
}

/** The same picture as a JPEG file, for sharing: Instagram and others can
 * refuse the AVIF and WebP the site shows. A JPEG passes through as is. */
export async function asJpeg(src: Blob): Promise<Blob> {
  if (src.type === "image/jpeg") return src;
  const bitmap = await createImageBitmap(src);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("Could not read that photo");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b === null
          ? reject(new Error("Could not read that photo"))
          : resolve(b),
      "image/jpeg",
      0.9,
    ),
  );
}
