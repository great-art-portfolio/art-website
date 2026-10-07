import { flag, type AppEnv } from "./env";
import type {
  CatalogItem,
  CheckoutBody,
  StripeAddress,
  StripeEvent,
} from "./validation";

/**
 * Stripe Checkout, off until ENABLE_STRIPE="true" and STRIPE_SECRET_KEY are
 * set. Buyers pay on Stripe's hosted page (cards, Apple Pay, Google Pay), so
 * no card data touches this site. The webhook (STRIPE_WEBHOOK_SECRET) marks
 * the painting sold. STRIPE_TAX="true" adds Stripe Tax, which needs the
 * head office address and tax registrations set in the Stripe dashboard.
 */

/** Checkout links expire after Stripe's 30-minute minimum, so a stale
 * page can't pay for long after the painting sold elsewhere. */
const SESSION_MINUTES = 30;

/** Countries the buyer can ship to. She ships from Calgary. */
const SHIP_TO = ["CA", "US"];

export function stripeEnabled(env: AppEnv): boolean {
  return flag(env.ENABLE_STRIPE) && (env.STRIPE_SECRET_KEY ?? "") !== "";
}

export type Sellable =
  | { ok: true; item: CatalogItem }
  | { ok: false; status: number; error: string };

/** Matches the page's request against the built catalog. The price and
 * title must agree with the build, so a stale or edited page can't set its
 * own price. */
export function findSellable(
  catalog: CatalogItem[],
  body: CheckoutBody,
): Sellable {
  const item = catalog.find((p) => p.slug === body.slug);
  if (item === undefined)
    return { ok: false, status: 404, error: "That painting isn't for sale." };
  if (item.sold)
    return {
      ok: false,
      status: 409,
      error: "Sorry, this painting has just sold.",
    };
  if (item.title !== body.title || item.priceCents !== body.priceCents)
    return {
      ok: false,
      status: 409,
      error: "This page is out of date. Reload it and try again.",
    };
  return { ok: true, item };
}

/** Form fields for POST /v1/checkout/sessions. Payment methods are left to
 * the dashboard, where cards, Apple Pay, and Google Pay are on by default. */
export function checkoutParams(
  item: CatalogItem,
  origin: string,
  opts: { tax: boolean; nowSec: number },
): URLSearchParams {
  const p = new URLSearchParams();
  p.set("mode", "payment");
  p.set("line_items[0][quantity]", "1");
  p.set("line_items[0][price_data][currency]", "cad");
  p.set("line_items[0][price_data][unit_amount]", String(item.priceCents));
  p.set("line_items[0][price_data][product_data][name]", item.title);
  p.set(
    "line_items[0][price_data][product_data][description]",
    "Original painting",
  );
  p.set("metadata[painting_slug]", item.slug);
  p.set("metadata[painting_title]", item.title);
  p.set("metadata[painting_file]", item.file);
  p.set("payment_intent_data[description]", `Painting: ${item.title}`);
  SHIP_TO.forEach((c, i) => {
    p.set(`shipping_address_collection[allowed_countries][${i}]`, c);
  });
  p.set("phone_number_collection[enabled]", "true");
  if (opts.tax) {
    // Tax is added on top of the listed price. An original painting is
    // plain tangible goods in Stripe's codes (there is no artwork code).
    p.set("automatic_tax[enabled]", "true");
    p.set("line_items[0][price_data][tax_behavior]", "exclusive");
    p.set("line_items[0][price_data][product_data][tax_code]", "txcd_99999999");
  }
  p.set("expires_at", String(opts.nowSec + SESSION_MINUTES * 60));
  p.set(
    "success_url",
    `${origin}/thanks?painting=${encodeURIComponent(item.slug)}`,
  );
  p.set("cancel_url", `${origin}/paintings/${encodeURIComponent(item.slug)}`);
  return p;
}

/** Creates the hosted Checkout page and returns its URL. */
export async function createCheckoutSession(
  env: AppEnv,
  params: URLSearchParams,
): Promise<string> {
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY ?? ""}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const data = (await res.json()) as { url?: unknown };
  if (!res.ok || typeof data.url !== "string")
    throw new Error(`Stripe error ${res.status}: ${JSON.stringify(data)}`);
  return data.url;
}

/** Five minutes, Stripe's default replay tolerance. */
const SIGNATURE_TOLERANCE_S = 300;

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time compare for equal-length hex strings. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Checks the Stripe-Signature header: "t=<unix>,v1=<hex>[,v1=…]", where v1
 * is HMAC-SHA256 of "<t>.<raw body>" keyed by the endpoint secret.
 * https://docs.stripe.com/webhooks#verify-manually
 */
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  nowSec: number,
): Promise<boolean> {
  if (header === null || secret === "") return false;
  let t = "";
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2);
    if (k === "t" && v !== undefined) t = v;
    if (k === "v1" && v !== undefined) sigs.push(v);
  }
  const ts = Number(t);
  if (!Number.isInteger(ts) || sigs.length === 0) return false;
  if (Math.abs(nowSec - ts) > SIGNATURE_TOLERANCE_S) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = hex(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${t}.${payload}`),
    ),
  );
  return sigs.some((s) => safeEqual(s, mac));
}

/** Events that mean the money is in: card payments complete paid, and
 * delayed methods follow with async_payment_succeeded. */
export function isPaidSale(event: StripeEvent): boolean {
  const s = event.data.object;
  if (event.type === "checkout.session.async_payment_succeeded") return true;
  return (
    event.type === "checkout.session.completed" && s.payment_status === "paid"
  );
}

function money(cents: number | null | undefined): string {
  return `$${((cents ?? 0) / 100).toFixed(2)} CAD`;
}

function addressLines(a: StripeAddress): string[] {
  if (a === null || a === undefined) return ["(no address)"];
  const cityLine = [a.city, a.state, a.postal_code]
    .filter((s) => s !== null && s !== undefined && s !== "")
    .join(" ");
  return [a.line1, a.line2, cityLine, a.country].filter(
    (s): s is string => s !== null && s !== undefined && s !== "",
  );
}

/** The artist's sale email: who bought what, and where to ship it. */
export function saleEmail(
  event: StripeEvent,
  opts: { alreadySold: boolean },
): { subject: string; text: string } {
  const s = event.data.object;
  const title = s.metadata?.["painting_title"] ?? "a painting";
  const buyer = s.customer_details;
  const ship = s.collected_information?.shipping_details;
  const lines = [
    `${buyer?.name ?? "Someone"} (${buyer?.email ?? "no email"}) bought "${title}".`,
    `Paid: ${money(s.amount_total)}` +
      ((s.total_details?.amount_tax ?? 0) > 0
        ? ` (includes ${money(s.total_details?.amount_tax)} tax)`
        : ""),
    buyer?.phone !== null && buyer?.phone !== undefined
      ? `Phone: ${buyer.phone}`
      : "",
    "",
    "Ship to:",
    ship?.name ?? buyer?.name ?? "",
    ...addressLines(ship?.address ?? buyer?.address),
    "",
    opts.alreadySold
      ? "WARNING: this painting was already marked sold. If someone else bought it first, refund this buyer in the Stripe dashboard."
      : "The painting is now marked sold on the website. Reply to this email to reach the buyer.",
    s.livemode === true ? "" : "(Stripe test mode: no real money moved.)",
  ];
  return {
    subject: `${opts.alreadySold ? "Check this sale" : "Sold"}: "${title}"`,
    text: lines.filter((l, i) => l !== "" || lines[i - 1] !== "").join("\n"),
  };
}
