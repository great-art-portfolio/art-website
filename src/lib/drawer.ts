/** Animated <details> drawers using the Web Animations API, since CSS
 * interpolate-size is Chromium-only. Under reduced motion the height
 * changes instantly and the fade still runs. */

const wired = new WeakSet<HTMLDetailsElement>();
const inFlight = new WeakMap<HTMLDetailsElement, Animation[]>();
/** Target open state for drawers that are mid-animation. */
const drawerTarget = new WeakMap<HTMLDetailsElement, boolean>();

/** Whether the drawer is open, using the animation target while animating. */
export function drawerOpen(details: HTMLDetailsElement): boolean {
  return drawerTarget.get(details) ?? details.open;
}

function stopAnims(details: HTMLDetailsElement): void {
  drawerTarget.delete(details);
  const anims = inFlight.get(details);
  if (anims !== undefined) {
    for (const a of anims) a.cancel();
    inFlight.delete(details);
  }
}

/** Toggles without animation, for reduced motion and older browsers. */
function snap(details: HTMLDetailsElement, open: boolean): void {
  stopAnims(details);
  details.style.overflow = "";
  details.open = open;
}

function contentKids(details: HTMLDetailsElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const el of details.children) {
    if (el instanceof HTMLElement && el.tagName !== "SUMMARY") out.push(el);
  }
  return out;
}

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Animates a drawer open or closed. A new toggle cancels the running
 * animation and starts from the current height, so rapid clicks reverse
 * smoothly. Page CSS should set only the opacity end states with no
 * transition, or it will fight the script.
 */
export function setDrawerOpen(
  details: HTMLDetailsElement,
  open: boolean,
): void {
  if (typeof details.animate !== "function") {
    snap(details, open);
    return;
  }
  // Already animating toward this state. Restarting would snap.
  if (drawerTarget.get(details) === open) return;
  stopAnims(details);
  if (details.open === open) return;
  drawerTarget.set(details, open);
  const calm = reducedMotion();
  const kids = contentKids(details);
  const fade = (from: string, to: string): Animation[] =>
    kids.map((kid) =>
      kid.animate([{ opacity: from }, { opacity: to }], {
        duration: calm ? 150 : 250,
        // Offset the fade from the height change in both directions.
        delay: calm ? 0 : 80,
        easing: "ease",
        fill: "backwards",
      }),
    );
  /** Tracks running animations. The last one to finish cleans up. */
  const track = (anims: Animation[], done: () => void): void => {
    const main = anims[0];
    if (main === undefined) {
      drawerTarget.delete(details);
      done();
      return;
    }
    inFlight.set(details, anims);
    main.onfinish = () => {
      if (inFlight.get(details) !== anims) return;
      inFlight.delete(details);
      drawerTarget.delete(details);
      details.style.overflow = "";
      done();
      for (const a of anims) a.cancel();
    };
  };
  if (open) {
    const start = details.getBoundingClientRect().height;
    details.open = true;
    const end = details.scrollHeight;
    if (calm || end <= start) {
      track(fade("0", "1"), () => {});
      return;
    }
    details.style.overflow = "clip";
    track(
      [
        details.animate([{ height: `${start}px` }, { height: `${end}px` }], {
          duration: 350,
          easing: "ease",
        }),
        ...fade("0", "1"),
      ],
      () => {},
    );
    return;
  }
  const head = details.firstElementChild;
  // Include the summary's bottom margin in the closed height. It collapses
  // through the closed details, so animating to the bare box height ends
  // short and the content below jumps.
  const headStyle = head instanceof HTMLElement ? getComputedStyle(head) : null;
  const end =
    head instanceof HTMLElement
      ? head.getBoundingClientRect().height +
        (Number.parseFloat(headStyle?.marginBottom ?? "") || 0)
      : 0;
  const start = details.getBoundingClientRect().height;
  if (calm || start <= end) {
    track(fade("1", "0"), () => {
      details.open = false;
    });
    return;
  }
  details.style.overflow = "clip";
  track(
    [
      details.animate([{ height: `${start}px` }, { height: `${end}px` }], {
        duration: 350,
        easing: "ease",
      }),
      ...fade("1", "0"),
    ],
    () => {
      details.open = false;
    },
  );
}

/**
 * Animates the drawer on summary click. Idempotent, so re-renders can wire
 * it again safely.
 */
export function wireDrawer(details: HTMLDetailsElement): void {
  if (wired.has(details)) return;
  wired.add(details);
  const head = details.firstElementChild;
  if (!(head instanceof HTMLElement) || head.tagName !== "SUMMARY") return;
  head.addEventListener("click", (ev) => {
    ev.preventDefault();
    setDrawerOpen(details, !details.open);
  });
}

/** Wires every drawer under root. */
export function wireDrawers(root: Element | Document, selector: string): void {
  for (const el of root.querySelectorAll(selector)) {
    if (el instanceof HTMLDetailsElement) wireDrawer(el);
  }
}
