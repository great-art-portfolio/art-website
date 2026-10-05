/**
 * Browser globals used by the inline page scripts. Those scripts are plain
 * JavaScript with no annotations, so non-standard globals are declared here.
 */
/**
 * The <model-viewer> element registered by /js/model-viewer.js. It's
 * configured by attributes, so it needs no extra members. Declaring it lets
 * `document.createElement("model-viewer")` return a typed element without
 * a cast.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration-merging point for future model-viewer members
interface ModelViewerElement extends HTMLElement {}

interface HTMLElementTagNameMap {
  "model-viewer": ModelViewerElement;
}

interface Window {
  /**
   * AR builder global set by /js/ar-tooling.js. The interface is defined in
   * `lib/vendor-loader`.
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
    ) => string | undefined;
    reset: (widgetId?: string) => void;
  };
  /** Detail lightbox doc-level listeners, registered once per session. */
  __detailDocWired?: boolean;
  /** Deferred PWA install prompt, kept until the footer button is tapped. */
  __deferredInstall?: Event | null;
  /** Page enter-fade listener, registered once per session. */
  __pageFadeWired?: boolean;
  /** Notify modal wiring, registered once per session. */
  __notifyWired?: boolean;
  __scrollBarWired?: boolean;
}
