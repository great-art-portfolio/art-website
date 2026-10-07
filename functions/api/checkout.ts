import type { AppEnv } from "../_lib/env";
import { gitConfig, readTextFile } from "../_lib/github";
import { PAINTING_FILE } from "../_lib/gallery-paths";
import { badRequest, json, notEnabled, serverError } from "../_lib/http";
import {
  checkoutParams,
  createCheckoutSession,
  findSellable,
  stripeEnabled,
} from "../_lib/stripe";
import { parseCatalog, parseCheckoutBody } from "../_lib/validation";
import { parsePainting } from "../../src/lib/painting-edit";

/**
 * Public: starts Stripe Checkout for one painting. Body: { slug, title,
 * priceCents } from the painting page. The price is checked against the
 * built /catalog.json, never trusted from the browser. Returns { url } of
 * Stripe's hosted page. 501 until Stripe is switched on.
 */
export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const { env, request } = context;
  if (!stripeEnabled(env))
    return notEnabled(
      "Card checkout",
      'Set ENABLE_STRIPE="true" and STRIPE_SECRET_KEY in Cloudflare, then redeploy.',
    );
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest("Invalid JSON");
  }
  const body = parseCheckoutBody(raw);
  if (body === null) return badRequest("A painting is required");
  const origin = new URL(request.url).origin;
  try {
    const catalogRes = await env.ASSETS.fetch(
      new Request(`${origin}/catalog.json`),
    );
    const catalog = catalogRes.ok ? parseCatalog(await catalogRes.json()) : [];
    const sellable = findSellable(catalog, body);
    if (!sellable.ok)
      return json({ error: sellable.error }, { status: sellable.status });
    // The catalog is as old as the last build. A sale commits sold: true
    // right away, so check git too and close the minutes before the
    // rebuild lands.
    const config = gitConfig(env);
    if (config !== null && PAINTING_FILE.test(sellable.item.file)) {
      const md = await readTextFile(config, sellable.item.file);
      if (md !== null && parsePainting(md)?.sold === true)
        return json(
          { error: "Sorry, this painting has just sold." },
          { status: 409 },
        );
    }
    const url = await createCheckoutSession(
      env,
      checkoutParams(sellable.item, origin, {
        tax: env.STRIPE_TAX === "true",
        nowSec: Math.floor(Date.now() / 1000),
      }),
    );
    return json({ url });
  } catch (err) {
    console.error(err);
    return serverError("Checkout isn't available right now.");
  }
};
