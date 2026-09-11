/**
 * Shared Cloudflare Turnstile widget loader — one loader for the inquiry
 * form and the collector modal. Cloudflare never injects the widget: each
 * public form fetches the site key from /api/status, loads the CDN once,
 * and renders into its own mount to mint a token the backend verifies.
 *
 * Re-evaluate against:
 * https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
 * https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/
 *
 * Lives in its own import-free module so node unit tests can load it
 * directly — src/lib keeps the extensionless style the bundler uses.
 */

let siteKeyPromise: Promise<string> | null = null;
let scriptPromise: Promise<void> | null = null;

/** Pick the public site key out of /api/status JSON ("" when missing). */
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
    // Spam check unavailable — the honeypot still guards the form.
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Render Turnstile into mountSelector once, reporting tokens via onToken.
 * No-op when the key is missing, the mount is absent, or the mount already
 * rendered. Safe to call on every page load — View Transitions keep the
 * module alive across navigations, so the mount is re-queried live.
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

/** Clear cached promises (unit tests only). */
export function __resetTurnstileCache(): void {
  siteKeyPromise = null;
  scriptPromise = null;
}
