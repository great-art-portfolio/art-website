/// <reference types="webxr" />
/** In-browser AR for hanging a painting on a real wall (Android, WebXR).
 * A true-size outline follows the wall where the phone points: faint and
 * facing the buyer while only the wall's distance is known (depth), solid
 * and flat once ARCore recognises the wall itself. A tap hangs the painting
 * there; it snaps flat when the wall is recognised later, one finger slides
 * it, two fingers turn it until then, and a tap on an outline elsewhere
 * moves it (another spot or another wall). An anchor keeps it on the wall
 * through tracking resets. Bundled into /js/model-viewer.js
 * (scripts/vendor/mv-entry.ts) so it shares that file's three.js, and
 * reached through window.WallAr. Blank walls in a bare room can keep
 * ARCore from tracking at all; no viewer gets past that. */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export interface WallArWords {
  /** Shown until tracking starts: the phone has to move to see the room. */
  move: string;
  /** Replaces move when tracking still hasn't started: buyers aim at the
   * wall, and a plain wall may never start it, while floors and furniture
   * have the detail it needs (Google's viewer starts on the floor). */
  stuck: string;
  /** Shown while tracking finds no wall in the middle of the view. */
  aim: string;
  /** Shown while the outline sits on a wall. */
  tap: string;
  /** Replaces aim when no wall has turned up for a while: detail is what
   * lets the phone recognise a wall. */
  hint: string;
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

/** Why the viewer stopped. `opened` says whether AR had started, so the
 * caller knows to try model-viewer's AR (no) or tell the buyer (yes). */
export class WallArError extends Error {
  readonly opened: boolean;
  constructor(message: string, opened: boolean, cause: unknown) {
    super(message, { cause });
    this.name = "WallArError";
    this.opened = opened;
  }
}

/** After this long with no wall, the note offers a tip instead. */
const HINT_AFTER_MS = 12000;
/** Once it hangs, a new spot is offered only this far from it (metres),
 * or on a wall turned this much from its own (radians, ~30°). */
const OFFER_AWAY_M = 0.75;
const OFFER_TURN_RAD = 0.5;
const upAxis = new THREE.Vector3(0, 1, 0);
/** After this long without tracking, it suggests the floor. */
const STUCK_AFTER_MS = 6000;
/** Sooner when tracking drops mid-use (a reset) than at the start. */
const STUCK_AGAIN_MS = 3000;

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
  if (xr === undefined)
    return Promise.reject(new WallArError("No WebXR", false, null));
  const overlay = buildOverlay(options.words);
  document.body.appendChild(overlay.root);
  // The model downloads alongside the session start; the 3D preview has
  // usually cached it already.
  const model = new GLTFLoader().loadAsync(options.glb);
  model.catch(() => undefined);
  return xr
    .requestSession("immersive-ar", {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["dom-overlay", "depth-sensing", "anchors"],
      domOverlay: { root: overlay.root },
      // Plain painted walls rarely become tracked planes; depth still sees
      // them (surfaceFromDepth).
      depthSensing: {
        usagePreference: ["cpu-optimized"],
        dataFormatPreference: ["luminance-alpha", "float32"],
      },
    })
    .then(
      (session) => run(session, overlay, model),
      (err: unknown) => {
        overlay.root.remove();
        throw new WallArError("AR didn't start", false, err);
      },
    );
}

type Note = "move" | "stuck" | "aim" | "hint" | "tap" | "";

interface Overlay {
  root: HTMLDivElement;
  /** Shows one of the words (with the moving phone for "move"), or hides
   * the note for "". */
  say(key: Note): void;
}

/** A phone outline that glides side to side: "move me slowly". */
const PHONE_SVG =
  '<svg viewBox="0 0 24 36" width="22" height="33" aria-hidden="true">' +
  '<rect x="2" y="1.5" width="20" height="33" rx="3.5" fill="none" ' +
  'stroke="currentColor" stroke-width="2.2"/>' +
  '<line x1="9" y1="30.5" x2="15" y2="30.5" stroke="currentColor" ' +
  'stroke-width="2.2" stroke-linecap="round"/></svg>';

function buildOverlay(words: WallArWords): Overlay {
  const root = document.createElement("div");
  Object.assign(root.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    fontFamily: "system-ui, sans-serif",
    zIndex: "2147483647",
  });
  const style = document.createElement("style");
  style.textContent =
    "@keyframes wall-ar-sweep{0%,100%{transform:translateX(-14px)}" +
    "50%{transform:translateX(14px)}}" +
    ".wall-ar-phone{display:inline-flex;animation:wall-ar-sweep 2.4s " +
    "ease-in-out infinite}" +
    "@media (prefers-reduced-motion:reduce){.wall-ar-phone{animation:none}}";
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
  const note = document.createElement("div");
  Object.assign(note.style, {
    position: "absolute",
    left: "50%",
    // Top, under the close button: Chrome covers the bottom with its own
    // "to exit full screen" notice for the first seconds.
    top: "calc(env(safe-area-inset-top, 0px) + 7.25rem)",
    transform: "translateX(-50%)",
    display: "flex",
    flexDirection: "column-reverse",
    alignItems: "center",
    gap: ".75rem",
    color: "#fff",
    transition: "opacity .25s ease",
    opacity: "0",
  });
  const phone = document.createElement("span");
  phone.className = "wall-ar-phone";
  phone.innerHTML = PHONE_SVG;
  phone.style.filter = "drop-shadow(0 1px 2px rgba(0,0,0,.6))";
  const text = document.createElement("p");
  Object.assign(text.style, {
    margin: "0",
    padding: ".6rem 1.1rem",
    borderRadius: "999px",
    background: "rgba(0,0,0,.55)",
    fontSize: "1rem",
    whiteSpace: "nowrap",
  });
  note.appendChild(phone);
  note.appendChild(text);
  root.appendChild(style);
  root.appendChild(close);
  root.appendChild(note);
  return {
    root,
    say(key) {
      root.dataset.note = key;
      if (key !== "") text.textContent = words[key];
      phone.style.display = key === "move" || key === "stuck" ? "" : "none";
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

/** Reads metres at normalized view coordinates straight from the depth
 * buffer. Kiwi's getDepthInMeters ignores x (a whole row of the view read
 * one value, so every wall looked square-on), so this maps view to buffer
 * with normDepthBufferFromNormView itself and takes the median of a 3×3
 * patch, skipping holes (0). */
function depthReader(
  map: XRCPUDepthInformation,
  format: XRDepthDataFormat | undefined,
): (x: number, y: number) => number {
  const M = map.normDepthBufferFromNormView.matrix;
  const { width: w, height: h, rawValueToMeters: scale } = map;
  const raw =
    format === "float32"
      ? new Float32Array(map.data)
      : new Uint16Array(map.data);
  const patch: number[] = [];
  return (x, y) => {
    const u = (M[0] ?? 0) * x + (M[4] ?? 0) * y + (M[12] ?? 0);
    const v = (M[1] ?? 0) * x + (M[5] ?? 0) * y + (M[13] ?? 0);
    const cx = Math.floor(u * w);
    const cy = Math.floor(v * h);
    patch.length = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const px = cx + dx;
        const py = cy + dy;
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        const value = raw[py * w + px] ?? 0;
        if (value > 0) patch.push(value * scale);
      }
    }
    if (patch.length < 5) return 0;
    patch.sort((p, q) => p - q);
    return patch[Math.floor(patch.length / 2)] ?? 0;
  };
}

/** Where the view's centre meets an upright surface, from the depth map:
 * the distance is good even on a plain wall, the angle isn't (ARCore
 * smooths a featureless wall's depth nearly flat), so the caller faces the
 * outline to the buyer until ARCore recognises the wall itself. Writes the
 * point; false when there's no upright surface there (floor, bed, a hole
 * in the depth). */
function surfaceFromDepth(
  frame: XRFrame,
  view: XRView,
  format: XRDepthDataFormat | undefined,
  pos: THREE.Vector3,
): boolean {
  let depth: XRCPUDepthInformation | null | undefined;
  try {
    depth = frame.getDepthInformation(view);
  } catch {
    // Depth wasn't granted for this session: plane hits only.
    return false;
  }
  if (depth === null || depth === undefined) return false;
  const metresAt = depthReader(depth, format);
  invProj.fromArray(view.projectionMatrix).invert();
  viewToWorld.fromArray(view.transform.matrix);
  const at = (x: number, y: number, out: THREE.Vector3): boolean => {
    const metres = metresAt(x, y);
    if (!(metres > 0.3 && metres < 6)) return false;
    out.set(2 * x - 1, 1 - 2 * y, -1).applyMatrix4(invProj);
    out.multiplyScalar(metres / -out.z).applyMatrix4(viewToWorld);
    return true;
  };
  // Upright: top to bottom of the view runs mostly vertical in the world.
  if (!at(0.5, 0.3, top) || !at(0.5, 0.7, point)) return false;
  top.sub(point);
  if (Math.abs(top.y) < 0.8 * top.length()) return false;
  return at(0.5, 0.5, pos);
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

/** Hangs and moves the painting: what a tap or drag means right now. */
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
  // Even, neutral light: buyers judge her colours, so the room's light
  // (often warm or dim) isn't applied to the painting.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8070, 2.4));
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const ended = new Promise<void>((resolve) => {
    session.addEventListener("end", () => resolve(), { once: true });
  });
  overlay.root
    .querySelector("button")
    ?.addEventListener("click", () => void session.end());

  let hitSource: XRHitTestSource | undefined;
  try {
    await renderer.xr.setSession(session);
    const viewer = await session.requestReferenceSpace("viewer");
    // Planes only: a lone feature point's normal is a guess, and turned
    // the painting sideways.
    hitSource = await session.requestHitTestSource?.({ space: viewer });
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
    const wallPos = new THREE.Vector3();
    const wallNormal = new THREE.Vector3();
    const toViewer = new THREE.Vector3();
    const goal = new THREE.Object3D();
    const m = new THREE.Matrix4();
    let hungAt = -Infinity;
    const outlineLook = aim.material;

    /** The wall in the middle of the view. "plane": ARCore recognises it,
     * so its angle is the wall's. "depth": only its distance is known, so
     * it faces the buyer until a plane turns up. Writes wallPos and
     * wallNormal. */
    const findWall = (
      frame: XRFrame,
      pose: XRViewerPose,
    ): "plane" | "depth" | "" => {
      if (refSpace === null || hitSource === undefined) return "";
      for (const hit of frame.getHitTestResults(hitSource)) {
        const p = hit.getPose(refSpace);
        // Chrome answers null, not undefined, for "no pose yet".
        if (!p) continue;
        m.fromArray(p.transform.matrix);
        wallNormal.set(m.elements[4], m.elements[5], m.elements[6]);
        if (Math.abs(wallNormal.y) < WALL_NORMAL_MAX_Y) {
          wallPos.setFromMatrixPosition(m);
          return "plane";
        }
      }
      const view = pose.views[0];
      if (
        view !== undefined &&
        surfaceFromDepth(frame, view, session.depthDataFormat, wallPos)
      ) {
        const v = pose.transform.position;
        wallNormal.set(v.x - wallPos.x, 0, v.z - wallPos.z);
        if (wallNormal.lengthSq() > 1e-6) return "depth";
      }
      return "";
    };

    // An anchor pins the painting to the room itself: when ARCore loses
    // tracking and rebuilds its map, raw coordinates move but the anchor
    // stays on the wall. Without anchor support it keeps its coordinates.
    let anchor: XRAnchor | null = null;
    let anchorWanted = false;
    const dropAnchor = () => {
      anchor?.delete();
      anchor = null;
    };
    const reanchor = (frame: XRFrame) => {
      anchorWanted = false;
      dropAnchor();
      if (refSpace === null || frame.createAnchor === undefined) return;
      const { x, y, z } = hung.position;
      const q = hung.quaternion;
      frame
        .createAnchor(
          new XRRigidTransform({ x, y, z }, { x: q.x, y: q.y, z: q.z, w: q.w }),
          refSpace,
        )
        .then(
          (made) => {
            if (anchorWanted || !hung.visible) made.delete();
            else anchor = made;
          },
          () => {
            // Anchors refused: the painting keeps its coordinates.
          },
        );
    };

    /** Whether the hung painting lies on a wall ARCore recognised, or still
     * faces where the buyer stood (a plain wall it can't read yet). */
    let snapped = false;
    let snapping = false;
    const snapTo = new THREE.Object3D();

    const hang = (time: number, frame: XRFrame, onPlane: boolean) => {
      hung.position.copy(aim.position);
      hung.quaternion.copy(aim.quaternion);
      hung.visible = true;
      aim.visible = false;
      snapped = onPlane;
      snapping = false;
      hungAt = still ? -Infinity : time;
      reanchor(frame);
      navigator.vibrate?.(12);
    };

    // One finger drags the painting along its wall, by the finger's own
    // movement; a quick touch that barely moves is a tap, which hangs it at
    // the outline (first time, or another spot or wall). Two fingers turn
    // it, while it still faces the buyer rather than a recognised wall.
    const plane = new THREE.Plane();
    const ray = new THREE.Ray();
    const fingerHit = (frame: XRFrame, source: XRInputSource) => {
      if (refSpace === null) return null;
      const p = frame.getPose(source.targetRaySpace, refSpace);
      if (!p) return null;
      m.fromArray(p.transform.matrix);
      ray.origin.setFromMatrixPosition(m);
      ray.direction.set(0, 0, -1).transformDirection(m);
      plane.setFromNormalAndCoplanarPoint(
        new THREE.Vector3(0, 0, 1).applyQuaternion(hung.quaternion),
        hung.position,
      );
      return ray.intersectPlane(plane, new THREE.Vector3());
    };
    const touches: XRInputSource[] = [];
    let touchStart = 0;
    let touchMoved = 0;
    /** Whether the first finger came down on the painting (a drag) or
     * elsewhere (a tap); null until the next frame can tell. */
    let grabbed: boolean | null = null;
    const onPainting = (at: THREE.Vector3) => {
      const local = hung.worldToLocal(at.clone());
      return (
        Math.abs(local.x) < size.x / 2 + 0.15 &&
        Math.abs(local.y) < size.y / 2 + 0.15
      );
    };
    let twisted = false;
    let lastFinger: THREE.Vector3 | null = null;
    let lastTwist: number | null = null;
    const anchorAt = new THREE.Vector3();
    const anchorTurn = new THREE.Quaternion();
    let tapped = false;
    session.addEventListener("selectstart", (e) => {
      touches.push(e.inputSource);
      if (touches.length === 1) {
        touchStart = performance.now();
        touchMoved = 0;
        twisted = false;
        grabbed = null;
      }
      lastFinger = null;
    });
    session.addEventListener("selectend", (e) => {
      const i = touches.indexOf(e.inputSource);
      if (i >= 0) touches.splice(i, 1);
      lastFinger = null;
      // The turn carries on while any finger is down (the frame loop
      // clears lastTwist when the screen is empty).
      if (touches.length > 0) return;
      const quick = performance.now() - touchStart < 400;
      if (!twisted && quick && (grabbed !== true || touchMoved < 0.02))
        tapped = true;
      // Moved by hand: pin it again where it landed.
      else if (hung.visible) anchorWanted = true;
    });
    /** The angle of the line between two fingers on the screen. Chrome
     * fires selectstart for the first finger only, so both are read from
     * the session's live screen inputs, as model-viewer does. */
    const fingerAngle = (fingers: XRInputSource[]): number | null => {
      const a = fingers[0]?.gamepad?.axes;
      const b = fingers[1]?.gamepad?.axes;
      if (a === undefined || b === undefined) return null;
      // Undirected (mod π): Chrome doesn't keep the two fingers in one
      // order, and a swap must not read as a half turn.
      const line = Math.atan2(
        (b[1] ?? 0) - (a[1] ?? 0),
        (b[0] ?? 0) - (a[0] ?? 0),
      );
      return ((line % Math.PI) + Math.PI) % Math.PI;
    };

    let said: Note | null = null;
    let lookingSince = -1;
    let lostSince = -1;
    let trackedOnce = false;
    let wasFirm = false;
    const say = (key: Note) => {
      if (key !== said) overlay.say(key);
      said = key;
    };

    renderer.setAnimationLoop((time, frame: XRFrame | undefined) => {
      // three also calls this outside XR frames, with no frame.
      if (frame === undefined || refSpace === null) return;
      const pose = frame.getViewerPose(refSpace);
      // null, not undefined, while ARCore isn't tracking.
      const tracking = !!pose && !pose.emulatedPosition;

      const onScreen = Array.from(session.inputSources).filter(
        (source) => source.targetRayMode === "screen",
      );
      // Hands stay on until every finger is off: Chrome can drop one
      // finger's selectend or input for a frame mid-gesture.
      const handsOn = touches.length > 0 || onScreen.length > 0;
      if (onScreen.length === 0) lastTwist = null;

      // Hands on the painting, or a snap under way: let go of the anchor,
      // and pin it again once it rests.
      if ((handsOn || snapping) && anchor !== null) dropAnchor();
      if (anchor !== null) {
        const p = frame.getPose(anchor.anchorSpace, refSpace);
        if (p) {
          m.fromArray(p.transform.matrix);
          anchorAt.setFromMatrixPosition(m);
          // Take only the anchor's heading: a painting never leans, even
          // when ARCore nudges the anchor's tilt.
          const facing = toViewer.set(0, 0, 1).transformDirection(m);
          anchorTurn.setFromAxisAngle(upAxis, Math.atan2(facing.x, facing.z));
          // Ease out ARCore's small corrections so it doesn't fidget; a
          // big move (a map reset) lands at once.
          const ease = hung.position.distanceTo(anchorAt) > 0.3 ? 1 : 0.15;
          hung.position.lerp(anchorAt, ease);
          hung.quaternion.slerp(anchorTurn, ease);
        }
      }
      if (anchorWanted && !handsOn && !snapping) reanchor(frame);

      const twoFingers = onScreen.length >= 2;
      const finger =
        touches.length === 1 && !twoFingers ? touches[0] : undefined;
      if (finger !== undefined && hung.visible) {
        const at = fingerHit(frame, finger);
        // Only a finger that lands on the painting moves it, as in Google's
        // viewer; elsewhere a touch is a tap (hang it at the outline).
        if (grabbed === null) grabbed = at !== null && onPainting(at);
        if (at !== null && grabbed) {
          if (lastFinger !== null) {
            touchMoved += at.distanceTo(lastFinger);
            hung.position.add(at.clone().sub(lastFinger));
          }
          lastFinger = at;
        }
      }
      if (twoFingers && hung.visible && !snapped) {
        const angle = fingerAngle(onScreen);
        if (angle !== null) {
          if (lastTwist !== null) {
            let turn = angle - lastTwist;
            if (turn > Math.PI / 2) turn -= Math.PI;
            if (turn < -Math.PI / 2) turn += Math.PI;
            hung.rotateY(-turn);
            twisted = true;
          }
          lastTwist = angle;
        }
      }
      const handling =
        touches.length > 0 &&
        ((grabbed === true && touchMoved >= 0.02) || twisted);

      const source = tracking && pose && !handling ? findWall(frame, pose) : "";
      let offer = false;
      if (source !== "" && pose) {
        const v = pose.transform.position;
        toViewer.set(v.x, v.y, v.z).sub(wallPos);
        goal.position.copy(wallPos);
        faceOut(goal, wallNormal, toViewer);
        // A recognised wall close behind a painting that still faces the
        // buyer: lay it flat on that wall.
        const behind = Math.abs(
          wallNormal.dot(snapTo.position.copy(hung.position).sub(wallPos)),
        );
        if (
          hung.visible &&
          !snapped &&
          source === "plane" &&
          behind < 0.5 &&
          wallPos.distanceTo(hung.position) < 1.5
        ) {
          snapTo.position
            .copy(hung.position)
            .addScaledVector(
              wallNormal,
              -wallNormal.dot(toViewer.copy(hung.position).sub(wallPos)),
            );
          snapTo.quaternion.copy(goal.quaternion);
          snapped = true;
          snapping = true;
          navigator.vibrate?.(12);
        }
        // Once it hangs, only offer a spot well away from it, or another
        // wall; near the painting, a tap is just a tap.
        offer =
          !snapping &&
          (!hung.visible ||
            goal.position.distanceTo(hung.position) > OFFER_AWAY_M ||
            goal.quaternion.angleTo(hung.quaternion) > OFFER_TURN_RAD);
        if (!aim.visible) {
          aim.position.copy(goal.position);
          aim.quaternion.copy(goal.quaternion);
        } else {
          // Depth is noisy: follow it gently. A recognised wall is steady.
          const ease = source === "plane" ? 0.3 : 0.1;
          aim.position.lerp(goal.position, ease);
          aim.quaternion.slerp(goal.quaternion, ease);
        }
      }
      aim.visible = offer;
      // Solid once it's on a recognised wall, soft while it only faces you;
      // a light buzz when it locks on.
      const firm = source === "plane";
      if (outlineLook instanceof THREE.MeshBasicMaterial)
        outlineLook.opacity = firm ? 0.95 : 0.55;
      if (firm && !wasFirm && offer) navigator.vibrate?.(8);
      wasFirm = firm && offer;
      if (tapped && offer) hang(time, frame, firm);
      tapped = false;

      // The snap swings the painting flat over a few frames.
      if (snapping) {
        hung.position.lerp(snapTo.position, still ? 1 : 0.2);
        hung.quaternion.slerp(snapTo.quaternion, still ? 1 : 0.2);
        if (
          hung.position.distanceTo(snapTo.position) < 0.002 &&
          hung.quaternion.angleTo(snapTo.quaternion) < 0.01
        ) {
          hung.position.copy(snapTo.position);
          hung.quaternion.copy(snapTo.quaternion);
          snapping = false;
          anchorWanted = true;
        }
      }

      overlay.root.dataset.source = source;
      overlay.root.dataset.hung = hung.visible ? "1" : "";
      overlay.root.dataset.snapped = snapped ? "1" : "";
      overlay.root.dataset.anchored = anchor === null ? "" : "1";
      if (lookingSince < 0 || !tracking || hung.visible || aim.visible)
        lookingSince = time;
      if (tracking) {
        lostSince = -1;
        trackedOnce = true;
      } else if (lostSince < 0) lostSince = time;
      const stuckAfter = trackedOnce ? STUCK_AGAIN_MS : STUCK_AFTER_MS;
      if (!tracking) say(time - lostSince > stuckAfter ? "stuck" : "move");
      else if (aim.visible) say("tap");
      else if (hung.visible) say("");
      else say(time - lookingSince > HINT_AFTER_MS ? "hint" : "aim");

      // Ease the painting in against the wall after it's hung.
      const t = Math.min(1, (time - hungAt) / SETTLE_MS);
      settle.position.z = SETTLE_FROM * (1 - t) * (1 - t);
      renderer.render(scene, camera);
    });

    await ended;
  } catch (err) {
    // Already ended is fine.
    await session.end().catch(() => undefined);
    throw new WallArError("AR stopped", true, err);
  } finally {
    renderer.setAnimationLoop(null);
    hitSource?.cancel();
    renderer.dispose();
    overlay.root.remove();
  }
}
