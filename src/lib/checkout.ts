/** Buyer side of card checkout. The server re-checks title and price
 * against the build, so these values only pick the painting. */

/** True when the site has card checkout switched on. */
export async function checkoutAvailable(): Promise<boolean> {
  try {
    const res = await fetch("/api/status");
    if (!res.ok) return false;
    const data = (await res.json()) as unknown;
    return (
      typeof data === "object" &&
      data !== null &&
      "stripe" in data &&
      data.stripe === true
    );
  } catch {
    return false;
  }
}

export type CheckoutStart = { url: string } | { error: string };

/** Asks the server for a Stripe Checkout page for one painting. */
export async function startCheckout(painting: {
  slug: string;
  title: string;
  priceCents: number;
}): Promise<CheckoutStart> {
  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(painting),
    });
    const data = (await res.json()) as unknown;
    if (typeof data === "object" && data !== null) {
      if ("url" in data && typeof data.url === "string" && res.ok)
        return { url: data.url };
      if ("error" in data && typeof data.error === "string" && res.status < 500)
        return { error: data.error };
    }
  } catch {
    // Offline or a network hiccup: same message as a server error.
  }
  return { error: "Checkout isn't available right now. Please try again." };
}
