/**
 * Browser globals the inline page scripts rely on. Inline <script> blocks
 * are plain JavaScript (no annotations survive `astro check`), so anything
 * beyond stock DOM types is declared here once instead of fought per file.
 */
interface Window {
  /** Cloudflare Turnstile widget API, present only after its CDN loads. */
  turnstile?: {
    render: (
      selector: string,
      options: { sitekey: string; callback: (token: string) => void },
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
