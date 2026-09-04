import type { AppEnv } from "../_lib/env";
import { json, requireAdmin, serverError } from "../_lib/http";
import { listSubscriptions, removeSubscription, sendTickle } from "../_lib/push";

/**
 * Admin: ping every collector ("there's a new painting, come look").
 * The service worker fetches the latest piece and shows it — the server
 * sends no message body, so no per-message encryption is needed.
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
    return json({ sent, gone, failed, total: subs.length });
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
