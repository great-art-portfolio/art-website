import { flag, type AppEnv } from "./env";

/**
 * Stripe, disabled by default. To enable later:
 *   1. Create a Stripe account (no monthly fee, pay per sale).
 *   2. Set ENABLE_STRIPE="true" and STRIPE_SECRET_KEY in Cloudflare.
 *   3. Point STRIPE_SUCCESS_URL / STRIPE_CANCEL_URL at the site.
 * Buyers go to Stripe's hosted checkout — no card handling in our code.
 */

export interface PaymentLink {
  enabled: boolean;
  url?: string;
}

export async function createPaymentLink(
  env: AppEnv,
  input: { title: string; amountCents: number; paintingId: string },
): Promise<PaymentLink> {
  if (!flag(env.ENABLE_STRIPE)) return { enabled: false };
  if (env.STRIPE_SECRET_KEY === undefined || env.STRIPE_SECRET_KEY === "") {
    throw new Error("ENABLE_STRIPE is true but STRIPE_SECRET_KEY is missing");
  }
  const params = new URLSearchParams();
  params.set("line_items[0][price_data][currency]", "cad");
  params.set("line_items[0][price_data][product_data][name]", input.title);
  params.set("line_items[0][price_data][unit_amount]", String(input.amountCents));
  params.set("line_items[0][quantity]", "1");
  params.set("metadata[painting_id]", input.paintingId);
  if (env.STRIPE_SUCCESS_URL !== undefined) params.set("success_url", env.STRIPE_SUCCESS_URL);
  if (env.STRIPE_CANCEL_URL !== undefined) params.set("cancel_url", env.STRIPE_CANCEL_URL);

  const res = await fetch("https://api.stripe.com/v1/payment_links", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`Stripe error: ${await res.text()}`);
  const data = (await res.json()) as { url: string };
  return { enabled: true, url: data.url };
}
