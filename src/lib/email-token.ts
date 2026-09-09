/**
 * Confirm / goodbye link landings post their token to /api/collectors.
 * Page scripts call this once (never on astro:page-load — the
 * unsubscribe call sends an email, so it must not re-fire).
 */
export async function settleToken(
  action: "confirm" | "unsubscribe",
  token: string,
): Promise<"ok" | "invalid"> {
  try {
    const res = await fetch("/api/collectors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, token }),
    });
    return res.ok ? "ok" : "invalid";
  } catch {
    return "invalid";
  }
}
