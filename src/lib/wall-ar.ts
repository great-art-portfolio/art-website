/// <reference types="webxr" />
/** In-browser AR for hanging a painting on a real wall (Android, WebXR).
 * A true-size outline follows the wall where the phone points; a tap hangs
 * the painting there, and a drag slides it along that wall. Bundled into
 * /js/model-viewer.js (scripts/vendor/mv-entry.ts) so it shares that
 * file's three.js, and reached through window.WallAr. */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export interface WallArWords {
  /** Shown until the phone finds a wall. */
  aim: string;
  /** Shown while the outline sits on a wall. */
  tap: string;
  /** The close button's label. */
  close: string;
}

export interface WallArOptions {
  glb: string;
  words: WallArWords;
}

export interface WallArApi {
  supported(): Promise<boolean>;
  start(options: WallArOptions): Promise<void>;
}

/** A hit counts as a wall when its normal is within ~20° of horizontal. */
const WALL_NORMAL_MAX_Y = 0.35;
/** The painting settles onto the wall from this far out, in metres. */
const SETTLE_FROM = 0.04;
const SETTLE_MS = 260;

export async function supported(): Promise<boolean> {
  const xr = navigator.xr;
  if (xr === undefined) return false;
  try {
    return await xr.isSessionSupported("immersive-ar");
  } catch {
    // Feature policy or a broken runtime: no AR here, the caller falls back.
    return false;
  }
}

/** Call from a tap: the session needs the tap's user activation. Resolves
 * when the viewer closes, rejects when it couldn't open. */
export function start(options: WallArOptions): Promise<void> {
  const xr = navigator.xr;
  if (xr === undefined) return Promise.reject(new Error("No WebXR"));
  const overlay = buildOverlay(options.words);
  document.body.appendChild(overlay.root);
  // The model downloads alongside the session start; the 3D preview has
  // usually cached it already.
  const model = new GLTFLoader().loadAsync(options.glb);
  model.catch(() => undefined);
  return xr
    .requestSession("immersive-ar", {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["dom-overlay", "depth-sensing"],
      domOverlay: { root: overlay.root },
      // Plain painted walls rarely become tracked planes; depth still sees
      // them (wallFromDepth).
      depthSensing: {
        usagePreference: ["cpu-optimized"],
        dataFormatPreference: ["luminance-alpha", "float32"],
      },
    })
    .then(
      (session) => run(session, overlay, model),
      (err: unknown) => {
        overlay.root.remove();
        throw err;
      },
    );
}

interface Overlay {
  root: HTMLDivElement;
  /** Shows one of the words, or hides the note for "". */
  say(key: "aim" | "tap" | ""): void;
}

function buildOverlay(words: WallArWords): Overlay {
  const root = document.createElement("div");
  Object.assign(root.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    fontFamily: "system-ui, sans-serif",
    zIndex: "2147483647",
  });
  const close = document.createElement("button");
  close.type = "button";
  close.setAttribute("aria-label", words.close);
  close.textContent = "×";
  Object.assign(close.style, {
    position: "absolute",
    // Kiwi draws the status bar over the top of the AR view.
    top: "calc(env(safe-area-inset-top, 0px) + 3.25rem)",
    right: "1rem",
    width: "3rem",
    height: "3rem",
    borderRadius: "50%",
    border: "1px solid rgba(255,255,255,.6)",
    background: "rgba(0,0,0,.35)",
    color: "#fff",
    fontSize: "1.75rem",
    lineHeight: "1",
    pointerEvents: "auto",
  });
  // A tap on the button must not also hang or move the painting.
  close.addEventListener("beforexrselect", (e) => e.preventDefault());
  const note = document.createElement("p");
  Object.assign(note.style, {
    position: "absolute",
    left: "50%",
    bottom: "max(2.5rem, env(safe-area-inset-bottom))",
    transform: "translateX(-50%)",
    margin: "0",
    padding: ".6rem 1.1rem",
    borderRadius: "999px",
    background: "rgba(0,0,0,.55)",
    color: "#fff",
    fontSize: "1rem",
    whiteSpace: "nowrap",
    transition: "opacity .25s ease",
  });
  root.appendChild(close);
  root.appendChild(note);
  return {
    root,
    say(key) {
      if (key !== "") note.textContent = words[key];
      note.style.opacity = key === "" ? "0" : "1";
    },
  };
}

/** A rounded-rectangle ring the painting's size, lying in the XY plane. */
function outlineMesh(w: number, h: number): THREE.Mesh {
  const line = 0.012;
  const rounded = (rw: number, rh: number, r: number): THREE.Path => {
    const p = new THREE.Shape();
    const x = -rw / 2;
    const y = -rh / 2;
    p.moveTo(x + r, y);
    p.lineTo(x + rw - r, y);
    p.quadraticCurveTo(x + rw, y, x + rw, y + r);
    p.lineTo(x + rw, y + rh - r);
    p.quadraticCurveTo(x + rw, y + rh, x + rw - r, y + rh);
    p.lineTo(x + r, y + rh);
    p.quadraticCurveTo(x, y + rh, x, y + rh - r);
    p.lineTo(x, y + r);
    p.quadraticCurveTo(x, y, x + r, y);
    return p;
  };
  const outer = rounded(w + line, h + line, 0.02);
  const shape = new THREE.Shape(outer.getPoints());
  shape.holes.push(rounded(w - line, h - line, 0.014));
  const ring = new THREE.Mesh(
    new THREE.ShapeGeometry(shape, 8),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    }),
  );
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    }),
  );
  ring.add(fill);
  return ring;
}

/** A soft shadow the painting casts on the wall just behind it. */
function shadowMesh(w: number, h: number): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx !== null) {
    ctx.shadowColor = "rgba(0,0,0,1)";
    ctx.shadowBlur = 28;
    // Draw the rectangle off-canvas so only its blurred shadow lands.
    ctx.shadowOffsetX = 1000;
    ctx.fillRect(-1000 + 40, 40, 176, 176);
  }
  const pad = 0.12;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w * (1 + pad * 2), h * (1 + pad * 2)),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
  );
  mesh.position.set(0, -0.012, 0.0005);
  return mesh;
}

const invProj = new THREE.Matrix4();
const viewToWorld = new THREE.Matrix4();
const point = new THREE.Vector3();
const top = new THREE.Vector3();
/** Across the view, wide apart so the wall's angle beats depth noise. */
const ROW = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];

/** Finds the wall at the centre of the view from the depth map, for walls
 * too plain for ARCore to track as a plane. A row of depths across the
 * view gives the wall's line on the floor plan (its angle); a top and a
 * bottom point check it stands upright. Writes the centre point and the
 * wall's horizontal normal; false when there's no such wall. */
function wallFromDepth(
  frame: XRFrame,
  view: XRView,
  pos: THREE.Vector3,
  normal: THREE.Vector3,
): boolean {
  let depth: XRCPUDepthInformation | null | undefined;
  try {
    depth = frame.getDepthInformation(view);
  } catch {
    // Depth wasn't granted for this session: plane hits only.
    return false;
  }
  if (depth === null || depth === undefined) return false;
  const map = depth;
  invProj.fromArray(view.projectionMatrix).invert();
  viewToWorld.fromArray(view.transform.matrix);
  const at = (x: number, y: number, out: THREE.Vector3): boolean => {
    const metres = map.getDepthInMeters(x, y);
    if (!(metres > 0.3 && metres < 6)) return false;
    out.set(2 * x - 1, 1 - 2 * y, -1).applyMatrix4(invProj);
    out.multiplyScalar(metres / -out.z).applyMatrix4(viewToWorld);
    return true;
  };
  // Upright: top to bottom of the view runs mostly vertical in the world.
  if (!at(0.5, 0.3, top) || !at(0.5, 0.7, point)) return false;
  top.sub(point);
  if (Math.abs(top.y) < 0.8 * top.length()) return false;
  // Least-squares line through the row, in the floor plane (x, z).
  let mx = 0;
  let mz = 0;
  let sxx = 0;
  let szz = 0;
  let sxz = 0;
  const xs: number[] = [];
  const zs: number[] = [];
  let centre = false;
  for (const x of ROW) {
    if (!at(x, 0.5, point)) continue;
    xs.push(point.x);
    zs.push(point.z);
    if (x === 0.5) {
      pos.copy(point);
      centre = true;
    }
  }
  const n = xs.length;
  if (n < 5 || !centre) return false;
  for (let i = 0; i < n; i++) {
    mx += xs[i] ?? 0;
    mz += zs[i] ?? 0;
  }
  mx /= n;
  mz /= n;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] ?? 0) - mx;
    const dz = (zs[i] ?? 0) - mz;
    sxx += dx * dx;
    szz += dz * dz;
    sxz += dx * dz;
  }
  // The row must span a real stretch of wall and lie close to one line.
  const spread = sxx + szz;
  if (spread < n * 0.01 * 0.01) return false;
  const angle = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  const ux = Math.cos(angle);
  const uz = Math.sin(angle);
  let off = 0;
  for (let i = 0; i < n; i++) {
    const d = ((xs[i] ?? 0) - mx) * -uz + ((zs[i] ?? 0) - mz) * ux;
    off += d * d;
  }
  if (Math.sqrt(off / n) > 0.03) return false;
  normal.set(-uz, 0, ux);
  return true;
}

/** Points the group's +Z out of the wall and keeps its up vertical. */
function faceOut(
  group: THREE.Object3D,
  normal: THREE.Vector3,
  toViewer: THREE.Vector3,
): void {
  const n = new THREE.Vector3(normal.x, 0, normal.z).normalize();
  if (n.dot(toViewer) < 0) n.negate();
  group.quaternion.setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    Math.atan2(n.x, n.z),
  );
}

async function run(
  session: XRSession,
  overlay: Overlay,
  model: Promise<{ scene: THREE.Group }>,
): Promise<void> {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local");
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8070, 2.4));

  const ended = new Promise<void>((resolve) => {
    session.addEventListener("end", () => resolve(), { once: true });
  });
  const closeButton = overlay.root.querySelector("button");
  closeButton?.addEventListener("click", () => void session.end());

  let hitSource: XRHitTestSource | undefined;
  try {
    await renderer.xr.setSession(session);
    const viewer = await session.requestReferenceSpace("viewer");
    // Feature points too: a plain wall rarely becomes a whole plane, but its
    // texture, a switch or a frame edge gives points with a normal.
    hitSource = await session
      .requestHitTestSource?.({
        space: viewer,
        entityTypes: ["plane", "point"],
      })
      ?.catch(() => session.requestHitTestSource?.({ space: viewer }));
    if (hitSource === undefined) throw new Error("No hit test");
    const gltf = await model;

    // Centre the painting and put its back flat on the wall plane (z = 0).
    const art = gltf.scene;
    const box = new THREE.Box3().setFromObject(art);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    art.position.set(-centre.x, -centre.y, -box.min.z);
    const hung = new THREE.Group();
    const settle = new THREE.Group();
    settle.add(art);
    hung.add(shadowMesh(size.x, size.y), settle);
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(0.2, 1, 1);
    hung.add(sun, sun.target);
    hung.visible = false;
    const aim = outlineMesh(size.x, size.y);
    aim.visible = false;
    scene.add(hung, aim);

    const refSpace = renderer.xr.getReferenceSpace();
    const hitPos = new THREE.Vector3();
    const hitNormal = new THREE.Vector3();
    const toViewer = new THREE.Vector3();
    const goal = new THREE.Object3D();
    const m = new THREE.Matrix4();
    let onWall = false;
    let hungAt = 0;

    // Dragging: the finger's ray against the wall the painting hangs on.
    let dragging: XRInputSource | null = null;
    const dragOffset = new THREE.Vector3();
    const plane = new THREE.Plane();
    const ray = new THREE.Ray();
    const fingerHit = (frame: XRFrame, source: XRInputSource) => {
      if (refSpace === null) return null;
      const pose = frame.getPose(source.targetRaySpace, refSpace);
      if (pose === undefined) return null;
      m.fromArray(pose.transform.matrix);
      ray.origin.setFromMatrixPosition(m);
      ray.direction.set(0, 0, -1).transformDirection(m);
      plane.setFromNormalAndCoplanarPoint(
        new THREE.Vector3(0, 0, 1).applyQuaternion(hung.quaternion),
        hung.position,
      );
      return ray.intersectPlane(plane, new THREE.Vector3());
    };

    let pendingTap = false;
    let pendingDrag: XRInputSource | null = null;
    session.addEventListener("selectstart", (e) => {
      if (hung.visible) pendingDrag = e.inputSource;
      else pendingTap = true;
    });
    session.addEventListener("selectend", () => {
      dragging = null;
      pendingDrag = null;
    });

    let said: "aim" | "tap" | "" | null = null;
    const say = (key: "aim" | "tap" | "") => {
      if (key !== said) overlay.say(key);
      said = key;
    };

    renderer.setAnimationLoop((time, frame: XRFrame | undefined) => {
      // three also calls this outside XR frames, with no frame.
      if (frame === undefined || refSpace === null || hitSource === undefined)
        return;
      const viewerPose = frame.getViewerPose(refSpace);

      if (!hung.visible) {
        const hits = frame.getHitTestResults(hitSource);
        onWall = false;
        const debug: number[] = [];
        for (const hit of hits) {
          const pose = hit.getPose(refSpace);
          if (pose === undefined || viewerPose === undefined) continue;
          m.fromArray(pose.transform.matrix);
          hitNormal.set(m.elements[4], m.elements[5], m.elements[6]);
          debug.push(Math.round(hitNormal.y * 100) / 100);
          if (Math.abs(hitNormal.y) < WALL_NORMAL_MAX_Y) {
            onWall = true;
            hitPos.setFromMatrixPosition(m);
            const v = viewerPose.transform.position;
            toViewer.set(v.x, v.y, v.z).sub(hitPos);
            goal.position.copy(hitPos);
            faceOut(goal, hitNormal, toViewer);
            if (!aim.visible) {
              aim.position.copy(goal.position);
              aim.quaternion.copy(goal.quaternion);
            } else {
              aim.position.lerp(goal.position, 0.3);
              aim.quaternion.slerp(goal.quaternion, 0.3);
            }
            break;
          }
        }
        const view = viewerPose?.views[0];
        let fromDepth = false;
        if (!onWall && view !== undefined && viewerPose !== undefined) {
          fromDepth = wallFromDepth(frame, view, hitPos, hitNormal);
          if (fromDepth) {
            onWall = true;
            const v = viewerPose.transform.position;
            toViewer.set(v.x, v.y, v.z).sub(hitPos);
            goal.position.copy(hitPos);
            faceOut(goal, hitNormal, toViewer);
            if (!aim.visible) {
              aim.position.copy(goal.position);
              aim.quaternion.copy(goal.quaternion);
            } else {
              aim.position.lerp(goal.position, 0.2);
              aim.quaternion.slerp(goal.quaternion, 0.2);
            }
          }
        }
        Reflect.set(window, "__wallDebug", {
          hits: debug,
          lost: viewerPose?.emulatedPosition ?? null,
          depth: session.depthUsage ?? null,
          fromDepth,
          ny: Math.round(hitNormal.y * 100) / 100,
        });
        aim.visible = onWall;
        say(onWall ? "tap" : "aim");
        if (pendingTap && onWall) {
          hung.position.copy(aim.position);
          hung.quaternion.copy(aim.quaternion);
          hung.visible = true;
          aim.visible = false;
          hungAt = time;
          say("");
          navigator.vibrate?.(12);
        }
        pendingTap = false;
      } else {
        if (pendingDrag !== null) {
          const at = fingerHit(frame, pendingDrag);
          if (at !== null) {
            dragging = pendingDrag;
            dragOffset.copy(hung.position).sub(at);
          }
          pendingDrag = null;
        }
        if (dragging !== null) {
          const at = fingerHit(frame, dragging);
          if (at !== null) hung.position.copy(at.add(dragOffset));
          aim.position.copy(hung.position);
          aim.quaternion.copy(hung.quaternion);
        }
        aim.visible = dragging !== null;
        // Ease the painting in against the wall after it's hung.
        const t = Math.min(1, (time - hungAt) / SETTLE_MS);
        settle.position.z = SETTLE_FROM * (1 - t) * (1 - t);
      }
      renderer.render(scene, camera);
    });

    await ended;
  } catch (err) {
    // Already ended is fine; the caller falls back either way.
    await session.end().catch(() => undefined);
    throw err;
  } finally {
    renderer.setAnimationLoop(null);
    hitSource?.cancel();
    renderer.dispose();
    overlay.root.remove();
  }
}
