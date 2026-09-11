/**
 * Browser globals the inline page scripts rely on. Inline <script> blocks
 * are plain JavaScript (no annotations survive `astro check`), so anything
 * beyond stock DOM types is declared here once instead of fought per file.
 */
/**
 * Studio preview element registered by /js/model-viewer.js. Attribute-driven,
 * so no members beyond HTMLElement — the declaration exists so
 * `document.createElement("model-viewer")` returns this instead of needing
 * an `as unknown as HTMLElement` at every call site.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration-merging point for future model-viewer members
interface ModelViewerElement extends HTMLElement {}

interface HTMLElementTagNameMap {
  "model-viewer": ModelViewerElement;
}

interface Window {
  /**
   * AR builder namespace (IIFE global from /js/ar-tooling.js). Declared
   * here so the loader reads it straight off `window` — the interface
   * itself lives once in `lib/vendor-loader`.
   */
  ArTooling?: import("./lib/vendor-loader").ArTooling;
  /** Cloudflare Turnstile widget API, present only after its CDN loads. */
  turnstile?: {
    render: (
      selector: string,
      options: {
        sitekey: string;
        callback: (token: string) => void;
        "expired-callback"?: () => void;
        "error-callback"?: () => void;
        "timeout-callback"?: () => void;
      },
    ) => void;
  };
  /** Detail lightbox doc-level listeners, registered once per session. */
  __detailDocWired?: boolean;
  /** PWA install prompt event, stashed until its footer button is tapped. */
  __deferredInstall?: Event | null;
  /** Page enter-fade listener, registered once per session. */
  __pageFadeWired?: boolean;
  /** Notify modal wiring, registered once per session. */
  __notifyWired?: boolean;
}
