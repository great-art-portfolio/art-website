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

/**
 * Renders Turnstile into mountSelector once and reports tokens via onToken.
 * Does nothing when the key or mount is missing or the mount has already
 * rendered. Safe to call on every page load, since it looks up the mount
 * each time.
 */
export function ensureTurnstile(
  mountSelector: string,
  onToken: (token: string) => void,
): void {
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
      try {
        api.render(mountSelector, {
          sitekey: key,
          callback: (token) => onToken(token),
          "expired-callback": () => onToken(""),
          "error-callback": () => onToken(""),
          "timeout-callback": () => onToken(""),
        });
      } catch {
        mount.dataset.turnstileWired = "";
      }
    });
  });
}

/** Clears cached promises. For unit tests. */
export function __resetTurnstileCache(): void {
  siteKeyPromise = null;
  scriptPromise = null;
}
