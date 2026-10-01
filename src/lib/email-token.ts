/**
 * Posts the token from a confirm or goodbye link to /api/collectors. Call
 * it once per page load, not on astro:page-load, because unsubscribing
 * sends an email.
 */
export async function settleToken(
  action: "confirm" | "unsubscribe",
  email: string,
  token: string,
): Promise<"ok" | "invalid"> {
  try {
    const res = await fetch("/api/collectors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, email, token }),
    });
    return res.ok ? "ok" : "invalid";
  } catch {
    return "invalid";
  }
}
