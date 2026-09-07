import type { AppEnv } from "../_lib/env";
import { json, requireAdmin, serverError } from "../_lib/http";
import { listCollectorEmails } from "../_lib/collectors";
import { sendCollectorBroadcast } from "../_lib/notify";
import {
  listSubscriptions,
  removeSubscription,
  sendTickle,
} from "../_lib/push";

/**
 * Admin: ping every collector ("there's a new painting, come look").
 * Two channels, one tap: the push tickle (the service worker fetches the
 * latest piece and shows it — the server sends no message body, so no
 * per-message encryption is needed) plus one email to the whole email
 * list. Either channel missing just skips quietly.
 */
export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const denied = requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  try {
    const subs = await listSubscriptions(context.env);
    let sent = 0;
    let gone = 0;
    let failed = 0;
    await Promise.all(
      subs.map(async (sub) => {
        const result = await sendTickle(context.env, sub);
        if (result === "sent") sent += 1;
        else if (result === "gone") {
          gone += 1;
          await removeSubscription(context.env, sub.endpoint);
        } else if (result === "retry") failed += 1;
        // "unconfigured" shouldn't happen (button hidden) — count as failed.
        else failed += 1;
      }),
    );
    const emails = await listCollectorEmails(context.env).catch(() => []);
    const site = context.env.SITE_URL ?? "https://barbart.ca";
    const emailed =
      emails.length === 0
        ? false
        : await sendCollectorBroadcast(
            context.env,
            "New painting at Barbara Straka's studio",
            [
              "A new painting is hung in the gallery — come look:",
              site,
              "",
              "— Barbara",
              "",
              "(Reply to this email to stop these alerts.)",
            ].join("\n"),
            emails,
          ).catch(() => false);
    return json({
      sent,
      gone,
      failed,
      total: subs.length,
      emailed,
      emailTotal: emails.length,
    });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};

/** Admin: how many collectors are subscribed (for the share panel). */
export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const denied = requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  try {
    return json({ total: (await listSubscriptions(context.env)).length });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
