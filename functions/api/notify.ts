import type { AppEnv } from "../_lib/env";
import { json, requireAdmin, serverError } from "../_lib/http";
import { segmentBroadcastEmail, sendCollectorBroadcast } from "../_lib/notify";
import {
  countSubscriptions,
  listSubscriptions,
  pushCooldownMs,
  readLastPushAt,
  removeSubscription,
  savePushMessage,
  sendTickle,
  stampPushAt,
  TICKLE_BATCH,
  type StoredSubscription,
} from "../_lib/push";

/** Admin: ping collectors. { push: false } / { email: false } send one side
 * only; both default on. { push: { body } } stores a custom line the
 * ping shows instead of the standard note. Repeat Ping taps within the
 * cooldown answer 429; empty pings and publish alerts never count.
 * Missing channels skip quietly. */
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
    let nextCursor: number | null = null;
    if (wantPush) {
      const pushOpt = body["push"];
      // Object form is the standalone Ping button; plain booleans are
      // publish alerts, which always go through (email especially).
      const isTickle = typeof pushOpt === "object" && pushOpt !== null;
      let subs: StoredSubscription[];
      if (isTickle) {
        // One Worker call only carries ~50 subrequests, so big lists walk
        // cursor by cursor — the button loops until nextCursor comes back
        // null. Only the first batch stores the line and stamps the
        // cooldown; continuations (cursor > 0) are the same ping.
        const tickle = pushOpt as Record<string, unknown>;
        const cursor = Math.max(
          0,
          Math.floor(Number(tickle["cursor"] ?? 0)) || 0,
        );
        total = await countSubscriptions(context.env);
        if (cursor === 0) {
          const line = String(tickle["body"] ?? "")
            .trim()
            .slice(0, 180);
          // A missing table (DB not yet migrated) must not eat the ping.
          await savePushMessage(context.env, line).catch((err: unknown) =>
            console.error("push message store failed", err),
          );
          if (total > 0) {
            const cooldown = pushCooldownMs(context.env);
            const since = Date.now() - (await readLastPushAt(context.env));
            if (since < cooldown) {
              const wait =
                cooldown < 60 * 1000 ? "a few seconds" : "a few minutes";
              return json(
                {
                  error: `Just pinged — give it ${wait} before the next one.`,
                },
                { status: 429 },
              );
            }
            // Stamp before fanning out so a double tap can't slip through.
            await stampPushAt(context.env);
          }
        }
        subs = await listSubscriptions(context.env, TICKLE_BATCH, cursor);
        nextCursor = cursor + subs.length < total ? cursor + subs.length : null;
      } else {
        subs = await listSubscriptions(context.env);
        total = subs.length;
      }
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
      nextCursor,
      emailed,
      emailTotal,
    });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};

/** Admin: push subscriber count plus the exact email a send would
 * deliver — the Marketing preview reads it, so what she sees is what
 * buyers get. */
export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const denied = requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  try {
    const site = context.env.SITE_URL ?? "https://barbart.ca";
    const { subject, text } = segmentBroadcastEmail(site);
    return json({
      total: (await listSubscriptions(context.env)).length,
      emailSubject: subject,
      emailText: text,
    });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
