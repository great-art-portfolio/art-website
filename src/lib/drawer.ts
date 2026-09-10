/** Animated disclosure, same ease on every browser (Web Animations API —
 * CSS interpolate-size only runs in Chromium). Reduced motion opens height
 * instantly; the fade still runs. */

const wired = new WeakSet<HTMLDetailsElement>();
const inFlight = new WeakMap<HTMLDetailsElement, Animation[]>();
/** Flight target while animating — the effective openness mid-flight. */
const drawerTarget = new WeakMap<HTMLDetailsElement, boolean>();

/** Effective openness: the flight's target while animating, else live. */
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

/** Instant native toggle: no script animation and old browsers. */
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
 * Ease a drawer open or shut, re-toggle safe: a new toggle cancels the
 * running flight and measures the live height as its start, so frantic
 * clicking reverses mid-flight instead of snapping. The page CSS holds
 * only the opacity endpoints — no transition there, or it would fight
 * the script mid-flight.
 */
export function setDrawerOpen(
  details: HTMLDetailsElement,
  open: boolean,
): void {
  if (typeof details.animate !== "function") {
    snap(details, open);
    return;
  }
  // A flight already headed there keeps flying — re-measuring
  // mid-flight is what used to snap frantic re-toggles.
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
        // A beat behind the unfold, both directions — the words arrive
        // once their room exists, and linger while it starts shutting.
        delay: calm ? 0 : 80,
        easing: "ease",
        fill: "backwards",
      }),
    );
  /** Park the flight; the last finish clears the scaffolding. */
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
  // Land on the full closed box: the summary's bottom margin collapses
  // through the closed details, so easing to the bare box height ends
  // short and the footer snaps on arrival. (Leading margins collapse
  // with the previous sibling outside the box — only trailing counts.)
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
 * One summary click drives the animation; idempotent, so collection
 * re-renders (which replace the nodes) can re-wire freely.
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

/** Wire every drawer under root. */
export function wireDrawers(root: Element | Document, selector: string): void {
  for (const el of root.querySelectorAll(selector)) {
    if (el instanceof HTMLDetailsElement) wireDrawer(el);
  }
}
