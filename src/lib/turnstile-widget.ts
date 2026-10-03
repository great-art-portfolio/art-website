/**
 * Cloudflare Turnstile loader shared by the inquiry form and the collector
 * modal. Each form fetches the site key from /api/status, loads the script
 * once, and renders into its own mount to get a token the backend verifies.
 *
 * See:
 * https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
 * https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/
 *
 * The module has no imports so node unit tests can load it directly.
 */

let siteKeyPromise: Promise<string> | null = null;
let scriptPromise: Promise<void> | null = null;

/** Extracts the public site key from /api/status JSON, or "" when missing. */
export function extractSiteKey(data: unknown): string {
  if (data !== null && typeof data === "object" && "turnstileSiteKey" in data) {
    const raw = (data as { turnstileSiteKey?: unknown }).turnstileSiteKey;
    return typeof raw === "string" ? raw : "";
  }
  return "";
}

export function getTurnstileSiteKey(): Promise<string> {
  if (siteKeyPromise === null) {
    siteKeyPromise = fetch("/api/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: unknown) => extractSiteKey(data))
      .catch(() => "");
  }
  return siteKeyPromise;
}

function loadTurnstileScript(): Promise<void> {
  if (scriptPromise !== null) return scriptPromise;
  scriptPromise = new Promise<void>((resolve) => {
    if (typeof document === "undefined") {
      resolve();
      return;
    }
    if (document.getElementById("turnstile-script") !== null) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.id = "turnstile-script";
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    // Turnstile failed to load. The honeypot still protects the form.
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** One rendered widget: its id, the unused token (if any), and sends
 * waiting for the next one. Tokens are single-use, so each send takes the
 * current token and resets the widget to mint another. */
interface Widget {
  id: string;
  token: string;
  waiters: Array<(token: string) => void>;
}

const widgets = new Map<string, Widget>();
/** Sends that asked before the widget rendered, keyed by mount. */
const early = new Map<string, Array<(token: string) => void>>();

function deliver(mountSelector: string, token: string): void {
  const widget = widgets.get(mountSelector);
  if (widget === undefined) return;
  const next = widget.waiters.shift();
  if (next === undefined) widget.token = token;
  else next(token);
}

/**
 * Renders Turnstile into mountSelector once. Does nothing when the key or
 * mount is missing or the mount has already rendered. Safe to call on every
 * page load, since it looks up the mount each time. Sends get their token
 * from takeTurnstileToken.
 */
export function ensureTurnstile(mountSelector: string): void {
  if (typeof document === "undefined") return;
  void getTurnstileSiteKey().then((key) => {
    if (key === "") return;
    void loadTurnstileScript().then(() => {
      const mount = document.querySelector(mountSelector);
      if (!(mount instanceof HTMLElement)) return;
      if (mount.dataset.turnstileWired === "1") return;
      const api = window.turnstile;
      if (api === undefined) return;
      mount.dataset.turnstileWired = "1";
      // A View Transitions swap brings a fresh mount; forget the old one.
      const stale = widgets.get(mountSelector);
      widgets.set(mountSelector, {
        id: "",
        token: "",
        waiters: [
          ...(stale?.waiters ?? []),
          ...(early.get(mountSelector) ?? []),
        ],
      });
      early.delete(mountSelector);
      try {
        const id = api.render(mountSelector, {
          sitekey: key,
          callback: (token) => deliver(mountSelector, token),
          "expired-callback": () => {
            const w = widgets.get(mountSelector);
            if (w !== undefined) w.token = "";
          },
        });
        const widget = widgets.get(mountSelector);
        if (widget !== undefined) widget.id = typeof id === "string" ? id : "";
      } catch {
        mount.dataset.turnstileWired = "";
      }
    });
  });
}

/**
 * The token for one send, or "" when Turnstile is off, failed to load, or
 * no token arrived within waitMs (the server then answers 403 and the
 * caller asks the visitor to finish the check). Waits for the widget when
 * it is still loading, then resets it so the next send gets a fresh one.
 */
export async function takeTurnstileToken(
  mountSelector: string,
  waitMs = 15_000,
): Promise<string> {
  if ((await getTurnstileSiteKey()) === "") return "";
  // Blocked or offline: no widget will ever render, so don't make the
  // visitor wait for one.
  await loadTurnstileScript();
  if (typeof window === "undefined" || window.turnstile === undefined) {
    return "";
  }
  const widget = widgets.get(mountSelector);
  let token: string;
  if (widget !== undefined && widget.token !== "") {
    token = widget.token;
    widget.token = "";
  } else {
    token = await new Promise<string>((resolve) => {
      let done = false;
      const settle = (t: string): void => {
        if (done) return;
        done = true;
        resolve(t);
      };
      if (widget !== undefined) widget.waiters.push(settle);
      else
        early.set(mountSelector, [...(early.get(mountSelector) ?? []), settle]);
      setTimeout(() => {
        // Give up quietly; a token that shows up later stays for the retry.
        const w = widgets.get(mountSelector);
        if (w !== undefined) w.waiters = w.waiters.filter((x) => x !== settle);
        const e = early.get(mountSelector);
        if (e !== undefined)
          early.set(
            mountSelector,
            e.filter((x) => x !== settle),
          );
        settle("");
      }, waitMs);
    });
  }
  const current = widgets.get(mountSelector);
  if (token !== "" && current !== undefined && current.id !== "") {
    try {
      window.turnstile?.reset(current.id);
    } catch {
      // A failed reset just means the next send waits for a new check.
    }
  }
  return token;
}

/** Clears cached promises. For unit tests. */
export function __resetTurnstileCache(): void {
  siteKeyPromise = null;
  scriptPromise = null;
  widgets.clear();
  early.clear();
}
