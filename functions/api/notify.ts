import type { AppEnv } from "../_lib/env";
import { json, requireAdmin, serverError } from "../_lib/http";
import { sendCollectorBroadcast } from "../_lib/notify";
import {
  listSubscriptions,
  removeSubscription,
  savePushMessage,
  sendTickle,
} from "../_lib/push";

/** Admin: ping collectors. { push: false } / { email: false } send one side
 * only; both default on. { push: { body } } stores a custom line the
 * ping shows instead of the standard note. Missing channels skip
 * quietly. */
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
      const pushOpt = body["push"];
      if (typeof pushOpt === "object" && pushOpt !== null) {
        const line = String((pushOpt as Record<string, unknown>)["body"] ?? "")
          .trim()
          .slice(0, 180);
        // A missing table (DB not yet migrated) must not eat the ping.
        await savePushMessage(context.env, line).catch((err: unknown) =>
          console.error("push message store failed", err),
        );
      }
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
      const site = context.env.SITE_URL ?? "https://barbart.ca";
      const result = await sendCollectorBroadcast(context.env, site).catch(
        () => ({ sent: 0, total: 0 }),
      );
      emailed = result.sent > 0;
      emailTotal = result.total;
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

/** Admin: push subscriber count for the share panel. */
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
