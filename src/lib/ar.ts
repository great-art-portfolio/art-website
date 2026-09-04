/**
 * AR models from a painting photo. A painting is flat, so there is no
 * scanning: the photo becomes the face of a true-scale framed box, exported
 * as GLB (Android Scene Viewer / WebXR) and USDZ (iOS Quick Look with
 * vertical wall anchoring). Runs entirely on her phone at upload time —
 * the Worker never touches 3D.
 */
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { USDZExporter } from "three/addons/exporters/USDZExporter.js";

const IN_TO_M = 0.0254;
const MAX_TEX_SIDE = 2048;

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

/** Missing tape measurements fall back to the photo's aspect at 24 in wide. */
export function estimateDims(
  img: HTMLImageElement,
  widthIn: number | null,
  heightIn: number | null,
  depthIn: number | null,
): { w: number; h: number; d: number } {
  const w = widthIn ?? 24;
  const h = heightIn ?? (w * img.naturalHeight) / Math.max(1, img.naturalWidth);
  return { w, h, d: depthIn ?? 1.5 };
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

  const art = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x1c1a17, roughness: 0.6 });
  const scene = new THREE.Scene();
  // Frame box + art plane a hair in front (multi-material boxes trip USDZ).
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frame));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), art);
  face.position.z = d / 2 + 0.001;
  scene.add(face);

  const gltf = new GLTFExporter();
  const glbBuf = (await gltf.parseAsync(scene, { binary: true })) as ArrayBuffer;

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
    usdzBuf = await usdz.parseAsync(scene, { quickLookCompatible: true });
  }

  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh === true) {
      mesh.geometry.dispose();
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        m.dispose();
      }
    }
  });
  texture.dispose();

  return {
    glb: new Blob([glbBuf], { type: "model/gltf-binary" }),
    usdz: new Blob([usdzBuf.buffer as ArrayBuffer], { type: "model/vnd.usdz" }),
  };
}
