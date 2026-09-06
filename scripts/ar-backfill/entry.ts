/**
 * Backfill entry: exposes the production buildArModels to the harness
 * page so scripts/ar-backfill/run.mjs can generate models outside the
 * upload flow (same code her devices run — no parallel implementation).
 */
import { buildArModels } from "../../src/lib/ar";

function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  });
}

async function buildFromUrl(
  url: string,
  w: number,
  h: number,
  d: number,
): Promise<{ glb: string; usdz: string; imgW: number; imgH: number }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error(`Photo didn't load: ${url}`));
    el.src = url;
  });
  const models = await buildArModels(img, w, h, d);
  return {
    glb: await blobToBase64(models.glb),
    usdz: await blobToBase64(models.usdz),
    imgW: img.naturalWidth,
    imgH: img.naturalHeight,
  };
}

(window as unknown as { __arBackfill: unknown }).__arBackfill = {
  buildFromUrl,
};
