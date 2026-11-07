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
import { logEvent } from "../_lib/log";

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
    if (!catalogRes.ok) {
      // Not "isn't for sale": the site's own list couldn't be read.
      await logEvent(env, {
        event: "checkout.catalog_unreadable",
        message: `catalog.json answered ${catalogRes.status}`,
        detail: { slug: body.slug },
        request,
      });
      return serverError(
        "Checkout isn't available right now. Try again in a minute.",
      );
    }
    const catalog = parseCatalog(await catalogRes.json());
    const sellable = findSellable(catalog, body);
    if (!sellable.ok)
      return json({ error: sellable.error }, { status: sellable.status });
    // The catalog is as old as the last build. A sale commits sold: true
    // right away, so check git too and close the minutes before the
    // rebuild lands.
    const config = gitConfig(env);
    if (config !== null && PAINTING_FILE.test(sellable.item.file)) {
      // A GitHub hiccup must not stop every sale: fall back to the
      // catalog. A painting that sold in those minutes is caught by the
      // webhook (already-sold email) and refunded by hand.
      const md = await readTextFile(config, sellable.item.file).catch(
        async (err: unknown) => {
          await logEvent(env, {
            level: "warn",
            event: "checkout.git_unreadable",
            message: "Couldn't read the painting from git; using the catalog",
            err,
            detail: { file: sellable.item.file },
            request,
          });
          return null;
        },
      );
      const live = md === null ? null : parsePainting(md);
      if (live?.sold === true)
        return json(
          { error: "Sorry, this painting has just sold." },
          { status: 409 },
        );
      // Taken down, or repriced, in the studio since the last build.
      if (live !== null && (live.draft || live.trash))
        return json(
          { error: "That painting isn't for sale." },
          { status: 404 },
        );
      if (
        live !== null &&
        Math.round(Number(live.price) * 100) !== sellable.item.priceCents
      )
        return json(
          { error: "This page is out of date. Reload it and try again." },
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
    await logEvent(context.env, {
      event: "checkout.threw",
      message: "Starting a checkout threw",
      err,
      request: context.request,
    });
    return serverError("Checkout isn't available right now.");
  }
};
