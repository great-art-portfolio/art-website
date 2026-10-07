import type { AppEnv } from "../_lib/env";
import { commitFiles, gitConfig, readTextFile } from "../_lib/github";
import { PAINTING_FILE } from "../_lib/gallery-paths";
import { badRequest, json, serverError } from "../_lib/http";
import { artistInbox, sendSiteEmail } from "../_lib/notify";
import { isPaidSale, saleEmail, verifyStripeSignature } from "../_lib/stripe";
import { parseStripeEvent } from "../_lib/validation";
import { markSold, parsePainting } from "../../src/lib/painting-edit";

/**
 * Stripe webhook: a paid checkout marks the painting `sold: true` with a
 * commit, like a studio save, so it can't sell twice, then emails the
 * artist the buyer and shipping address. A failed commit answers 500 so
 * Stripe retries. Other events are acknowledged and ignored.
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
  if (event === null || !isPaidSale(event)) return json({ ignored: true });

  const file = event.data.object.metadata?.["painting_file"] ?? "";
  const title = event.data.object.metadata?.["painting_title"] ?? file;
  let alreadySold = false;
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
        alreadySold = true;
      } else {
        await commitFiles(config, `Sold online: ${title}`, [
          { path: file, content: markSold(md) },
        ]);
      }
    } catch (err) {
      console.error(err);
      return serverError("Could not mark the painting sold");
    }
  }

  const mail = saleEmail(event, { alreadySold });
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
  if (!emailed) console.error("sale email not sent:", mail.subject);
  return json({ ok: true, alreadySold });
};
