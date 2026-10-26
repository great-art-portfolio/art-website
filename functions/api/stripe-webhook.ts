import type { AppEnv } from "../_lib/env";
import { commitFiles, gitConfig, readTextFile } from "../_lib/github";
import { PAINTING_FILE } from "../_lib/gallery-paths";
import { badRequest, json, serverError } from "../_lib/http";
import { artistInbox, sendSiteEmail } from "../_lib/notify";
import {
  expireOtherSessions,
  isPaidSale,
  saleEmail,
  verifyStripeSignature,
} from "../_lib/stripe";
import { parseStripeEvent } from "../_lib/validation";
import {
  markSold,
  parsePainting,
  soldSessionOf,
} from "../../src/lib/painting-edit";

/**
 * Stripe webhook: a paid checkout marks the painting `sold: true` with a
 * commit, like a studio save, so it can't sell twice, then emails the
 * artist the buyer and shipping address. A failed commit answers 500 so
 * Stripe retries. Other events are acknowledged and ignored. The commit
 * records the session, so a repeat delivery of the same sale doesn't
 * commit again or warn her of a double sale; it just resends the sale
 * email, since Stripe only repeats a delivery this answered with an error.
 * A sale email that fails answers 500 too, so she always hears of it.
 * Once sold, every other open checkout for the painting is closed.
 */
export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const { env, request } = context;
  const payload = await request.text();
  const valid = await verifyStripeSignature(
    payload,
    request.headers.get("stripe-signature"),
    env.STRIPE_WEBHOOK_SECRET ?? "",
    Math.floor(Date.now() / 1000),
  );
  if (!valid) return badRequest("Bad signature");
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return badRequest("Invalid JSON");
  }
  const event = parseStripeEvent(raw);
  if (event === null) {
    // A checkout event we can't read may be a real sale: have Stripe
    // retry it (and log it) rather than drop it.
    const type =
      typeof raw === "object" && raw !== null && "type" in raw
        ? String((raw as { type: unknown }).type)
        : "";
    if (type.startsWith("checkout.session.")) {
      console.error("unreadable checkout event", payload.slice(0, 500));
      return serverError("Unreadable checkout event");
    }
    return json({ ignored: true });
  }
  if (!isPaidSale(event)) return json({ ignored: true });

  const file = event.data.object.metadata?.["painting_file"] ?? "";
  const title = event.data.object.metadata?.["painting_title"] ?? file;
  const session = event.data.object.id;
  const slug = event.data.object.metadata?.["painting_slug"] ?? "";
  let alreadySold = false;
  let marked = false;
  let duplicate = false;
  const config = gitConfig(env);
  if (!PAINTING_FILE.test(file)) {
    console.error("sale without a painting file", event.id);
  } else if (config === null) {
    console.error("GitHub is not configured; not marking sold:", file);
  } else {
    try {
      const md = await readTextFile(config, file);
      if (md === null) {
        console.error("sold painting file is missing:", file);
      } else if (parsePainting(md)?.sold === true) {
        if (soldSessionOf(md) === session) {
          duplicate = true;
          marked = true;
        } else alreadySold = true;
      } else {
        await commitFiles(config, `Sold online: ${title}`, [
          { path: file, text: markSold(md, session) },
        ]);
        marked = true;
      }
    } catch (err) {
      console.error(err);
      return serverError("Could not mark the painting sold");
    }
  }

  if (marked && !alreadySold) await expireOtherSessions(env, slug, session);

  const mail = saleEmail(event, { alreadySold, marked });
  const emailed = await sendSiteEmail(env, {
    to: [artistInbox(env)],
    ...(event.data.object.customer_details?.email
      ? { replyTo: event.data.object.customer_details.email }
      : {}),
    ...mail,
  }).catch((err: unknown) => {
    console.error("sale email failed", err);
    return false;
  });
  if (!emailed) {
    // Stripe retries; the painting is already marked, so the retry only
    // sends this email.
    console.error("sale email not sent:", mail.subject);
    return serverError("Sale email not sent");
  }
  return json(duplicate ? { ok: true, duplicate } : { ok: true, alreadySold });
};
