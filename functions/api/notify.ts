import type { AppEnv } from "../_lib/env";
import { json, requireAdmin, serverError } from "../_lib/http";
import { listConfirmedCollectorEmails } from "../_lib/collectors";
import { sendCollectorBroadcast } from "../_lib/notify";
import {
  listSubscriptions,
  removeSubscription,
  sendTickle,
} from "../_lib/push";

/**
 * Admin: ping collectors ("there's a new painting, come look"). Body picks
 * channels — { push: false } skips the browser tickles, { email: false }
 * skips the email broadcast; both default on. The push tickle carries no
 * message body (the service worker fetches the latest piece and shows
 * it), so no per-message encryption is needed. Either channel missing
 * just skips quietly.
 */
export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const denied = requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const wantPush = body["push"] !== false;
  const wantEmail = body["email"] !== false;
  try {
    let sent = 0;
    let gone = 0;
    let failed = 0;
    let total = 0;
    if (wantPush) {
      const subs = await listSubscriptions(context.env);
      total = subs.length;
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
    }
    let emailed = false;
    let emailTotal = 0;
    if (wantEmail) {
      const recipients = await listConfirmedCollectorEmails(context.env).catch(
        () => [],
      );
      emailTotal = recipients.length;
      const site = context.env.SITE_URL ?? "https://barbart.ca";
      const result = await sendCollectorBroadcast(
        context.env,
        site,
        recipients,
      ).catch(() => ({ sent: 0, total: recipients.length }));
      emailed = result.sent > 0;
    }
    return json({
      sent,
      gone,
      failed,
      total,
      emailed,
      emailTotal,
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
