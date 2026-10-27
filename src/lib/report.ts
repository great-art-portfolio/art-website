/** Browser errors for agents: uncaught errors and rejected promises on any
 * page, plus failures the studio reports on purpose, go to /api/log and
 * land in the D1 `logs` table (`pnpm logs`). Nothing here is shown to the
 * visitor, and reporting never throws. */

/** One visit (the module lives across page swaps) sends at most this many,
 * so a loop can't flood the log. */
const MAX_PER_PAGE = 5;
let sent = 0;
let installed = false;

/** Errors from browser extensions and cross-origin scripts carry no
 * useful detail and aren't ours to fix. */
export function isNoise(message: string, source: string): boolean {
  if (message === "" || message === "Script error.") return true;
  if (/ResizeObserver loop/.test(message)) return true;
  return /^(chrome|moz|safari|safari-web)-extension:/.test(source);
}

function describe(err: unknown): { message: string; stack: string } {
  if (err instanceof Error)
    return { message: err.message, stack: err.stack ?? "" };
  return { message: String(err), stack: "" };
}

/** Sends one entry. `event` is a stable key after "client.", e.g.
 * "studio.save_failed". "warn" is for things shown to her that may be
 * her own slip (a missing title) rather than a fault. */
export function reportError(
  event: string,
  err: unknown,
  detail: Record<string, unknown> = {},
  level: "error" | "warn" = "error",
): void {
  try {
    if (sent >= MAX_PER_PAGE) return;
    sent += 1;
    const { message, stack } = describe(err);
    void fetch("/api/log", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        message: message.slice(0, 500),
        stack: stack.slice(0, 2000),
        page: location.pathname,
        level,
        detail,
      }),
    }).catch(() => {
      // Offline or blocked: the console still has it.
    });
  } catch {
    // Reporting must never break the page.
  }
}

/** Catches what nothing else did. Safe to call on every page load. */
export function installErrorReporting(): void {
  if (installed) return;
  installed = true;
  window.addEventListener("error", (e) => {
    const source = e.filename ?? "";
    if (isNoise(e.message ?? "", source)) return;
    reportError("uncaught", e.error ?? e.message, {
      source,
      line: e.lineno,
      column: e.colno,
    });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const { message } = describe(e.reason);
    if (isNoise(message, "")) return;
    reportError("unhandled_rejection", e.reason);
  });
}
