import type { AppEnv } from "../_lib/env";
import {
  commitFiles,
  gitConfig,
  headSha,
  isRefRace,
  readTextFile,
} from "../_lib/github";
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
import { logEvent } from "../_lib/log";
import { forgetLivePainting } from "./checkout";

/** Reads of the painting a sale may take when commits keep landing. */
const MARK_TRIES = 3;

/**
 * Stripe webhook: a paid checkout marks the painting `sold: true` with a
 * commit, like a studio save, so it can't sell twice, then emails the
 * artist the buyer and shipping address. A failed commit answers 500 so
 * Stripe retries. Other events are acknowledged and ignored. The commit
 * records the session, so a repeat delivery of the same sale doesn't
 * commit again or warn her of a double sale; it just resends the sale
 * email, since Stripe only repeats a delivery this answered with an error.
 * A sale email that fails answers 500 too, so she always hears of it.
 * Every other open checkout for the painting is closed first, before git
 * is touched, so a GitHub outage can't let more buyers pay meanwhile.
 * The commit builds on exactly the commit the painting was read at, so two
 * sales close together can't both pass as the first.
 */
export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const { env, request } = context;
  const payload = await request.text();
  const secret = env.STRIPE_WEBHOOK_SECRET ?? "";
  const signature = request.headers.get("stripe-signature");
  if (secret === "") {
    await logEvent(env, {
      event: "sale.no_webhook_secret",
      message: "STRIPE_WEBHOOK_SECRET isn't set, so no sale can be recorded",
    });
    return serverError("Webhook not configured");
  }
  const valid = await verifyStripeSignature(
    payload,
    signature,
    secret,
    Math.floor(Date.now() / 1000),
  );
  if (!valid) {
    // Only signed-looking deliveries are logged, so junk posts can't fill
    // the log; a wrong secret shows up here on every real sale.
    if (signature !== null)
      await logEvent(env, {
        level: "warn",
        event: "sale.bad_signature",
        message:
          "A Stripe delivery failed its signature check: is STRIPE_WEBHOOK_SECRET the live endpoint's?",
      });
    return badRequest("Bad signature");
  }
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
      // Only the event's id: its body carries the buyer's details.
      await logEvent(env, {
        event: "sale.unreadable_event",
        message: "A checkout event couldn't be read; Stripe will retry",
        detail: {
          eventId:
            typeof raw === "object" && raw !== null && "id" in raw
              ? String((raw as { id: unknown }).id)
              : "",
          type,
        },
      });
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
  // A paid sale closes the painting's other checkouts whatever git says
  // (a second buyer of a sold painting just repeats it).
  await expireOtherSessions(env, slug, session);
  if (!PAINTING_FILE.test(file)) {
    await logEvent(env, {
      event: "sale.no_painting_file",
      message: "A sale carried no painting file",
      detail: { eventId: event.id, session },
    });
  } else if (config === null) {
    await logEvent(env, {
      event: "sale.github_unconfigured",
      message: "GitHub isn't configured, so a sold painting wasn't marked",
      detail: { file, session },
    });
  } else {
    try {
      for (let attempt = 1; ; attempt += 1) {
        const at = await headSha(config);
        const md = await readTextFile(config, file, at);
        if (md === null) {
          await logEvent(env, {
            event: "sale.file_missing",
            message: "The sold painting's file is missing",
            detail: { file, session },
          });
        } else if (parsePainting(md)?.sold === true) {
          if (soldSessionOf(md) === session) {
            duplicate = true;
            marked = true;
          } else alreadySold = true;
        } else {
          try {
            await commitFiles(
              config,
              `Sold online: ${title}`,
              [{ path: file, text: markSold(md, session) }],
              { parent: at },
            );
          } catch (err) {
            // Something landed after the read: read again, since it may
            // be another sale of this painting.
            if (isRefRace(err) && attempt < MARK_TRIES) continue;
            throw err;
          }
          marked = true;
          await forgetLivePainting(file);
        }
        break;
      }
    } catch (err) {
      await logEvent(env, {
        event: "sale.mark_failed",
        message: "Couldn't mark a sold painting; Stripe will retry",
        err,
        detail: { file, session },
      });
      return serverError("Could not mark the painting sold");
    }
  }

  const mail = saleEmail(event, { alreadySold, marked });
  const emailed = await sendSiteEmail(env, {
    to: [artistInbox(env)],
    ...(event.data.object.customer_details?.email
      ? { replyTo: event.data.object.customer_details.email }
      : {}),
    ...mail,
  }).catch(async (err: unknown) => {
    await logEvent(env, {
      event: "sale.email_threw",
      message: "The sale email threw",
      err,
      detail: { session },
    });
    return false;
  });
  if (!emailed) {
    // Stripe retries; the painting is already marked, so the retry only
    // sends this email.
    await logEvent(env, {
      event: "sale.email_not_sent",
      message: "The sale email didn't go out; Stripe will retry",
      detail: { session, subject: mail.subject },
    });
    return serverError("Sale email not sent");
  }
  return json(duplicate ? { ok: true, duplicate } : { ok: true, alreadySold });
};
