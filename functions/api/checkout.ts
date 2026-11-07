import type { AppEnv } from "../_lib/env";
import { gitConfig, readTextFile } from "../_lib/github";
import { PAINTING_FILE } from "../_lib/gallery-paths";
import { badRequest, json, notEnabled, serverError } from "../_lib/http";
import {
  checkoutParams,
  createCheckoutSession,
  findSellable,
  type LivePainting,
  STRIPE_SETUP,
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
  if (!stripeEnabled(env)) return notEnabled("Card checkout", STRIPE_SETUP);
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
    const listed = findSellable(catalog, body);
    if (!listed.ok)
      return json({ error: listed.error }, { status: listed.status });
    // The catalog is as old as the last build. A sale commits sold: true
    // right away, so check git too and close the minutes before the
    // rebuild lands.
    const live = await livePainting(env, listed.item.file, request);
    const sellable = findSellable(catalog, body, live);
    if (!sellable.ok)
      return json({ error: sellable.error }, { status: sellable.status });
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

/** How long a painting's git state is reused between checkouts. A flood
 * of requests then costs one GitHub read per painting per window, not one
 * each, so it can't use up the key the studio and the sale webhook share.
 * A sale clears it (forgetLivePainting). */
const LIVE_CACHE_S = 15;

/** Null where there's no Cache API (local tests). */
const liveCache = (): Promise<Cache | null> =>
  typeof caches === "undefined"
    ? Promise.resolve(null)
    : caches.open("checkout-live").catch(() => null);

const liveKey = (file: string): Request =>
  new Request(`https://checkout-cache.invalid/${encodeURIComponent(file)}`);

/** The painting as git has it now, through a short cache. A GitHub hiccup
 * must not stop every sale, so it answers null (use the catalog); a sale
 * in that gap is caught by the webhook's already-sold email. */
async function livePainting(
  env: AppEnv,
  file: string,
  request: Request,
): Promise<LivePainting> {
  const config = gitConfig(env);
  if (config === null || !PAINTING_FILE.test(file)) return null;
  const cache = await liveCache();
  let md: string | null;
  const hit = await cache?.match(liveKey(file));
  if (hit !== undefined) {
    md = hit.headers.get("x-missing") === "1" ? null : await hit.text();
  } else {
    try {
      md = await readTextFile(config, file);
    } catch (err) {
      await logEvent(env, {
        level: "warn",
        event: "checkout.git_unreadable",
        message: "Couldn't read the painting from git; using the catalog",
        err,
        detail: { file },
        request,
      });
      return null;
    }
    await cache
      ?.put(
        liveKey(file),
        new Response(md ?? "", {
          headers: {
            "Cache-Control": `max-age=${LIVE_CACHE_S}`,
            "x-missing": md === null ? "1" : "0",
          },
        }),
      )
      .catch(() => undefined);
  }
  // Deleted in the studio since the build.
  if (md === null) return "missing";
  const p = parsePainting(md);
  if (p === null) return null;
  return {
    sold: p.sold,
    draft: p.draft,
    trash: p.trash,
    priceCents: Math.round(Number(p.price) * 100),
  };
}

/** Drops the cached git state of a painting that just sold. */
export async function forgetLivePainting(file: string): Promise<void> {
  await (await liveCache())?.delete(liveKey(file)).catch(() => false);
}
