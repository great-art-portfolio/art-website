import type { AppEnv } from "../_lib/env";
import { json, requireAdmin, serverError } from "../_lib/http";
import {
  cleanBroadcastBody,
  cleanBroadcastSubject,
  segmentBroadcastEmail,
  sendCollectorBroadcast,
} from "../_lib/notify";
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

/** Admin: notifies collectors. Both channels default on, and
 * { push: false } or { email: false } sends only one. { push: { body } }
 * replaces the standard ping text. Repeat pings within the cooldown get a
 * 429. Publish alerts and pings that reach no one don't start the
 * cooldown. Unconfigured channels are skipped. */
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
      // An object comes from the Ping button. A boolean is a publish alert,
      // which skips the cooldown.
      const isTickle = typeof pushOpt === "object" && pushOpt !== null;
      let subs: StoredSubscription[];
      if (isTickle) {
        // A Worker call allows about 50 subrequests, so large lists are
        // paged by cursor until nextCursor is null. Only the first batch
        // stores the text and starts the cooldown.
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
          const title = String(tickle["title"] ?? "")
            .trim()
            .slice(0, 80);
          // If the table is missing because the DB isn't migrated, still
          // send the ping.
          await savePushMessage(context.env, line, title).catch(
            (err: unknown) => console.error("push message store failed", err),
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
            // Stamp before sending so a double tap can't send twice.
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
          // "unconfigured" is unexpected here since the button is hidden.
          // Count it as failed.
          else failed += 1;
        }),
      );
    }
    let emailed = false;
    let emailTotal = 0;
    if (wantEmail) {
      const site = context.env.SITE_URL ?? "https://barbart.ca";
      // An object comes from the Email page with a custom subject and body.
      // A boolean sends the standard text.
      const emailOpt = body["email"];
      const emailCopy =
        typeof emailOpt === "object" && emailOpt !== null
          ? (emailOpt as Record<string, unknown>)
          : null;
      const result = await sendCollectorBroadcast(
        context.env,
        site,
        emailCopy === null ? "" : cleanBroadcastSubject(emailCopy["subject"]),
        emailCopy === null ? "" : cleanBroadcastBody(emailCopy["body"]),
      ).catch(() => ({ sent: 0, total: 0 }));
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

/** Admin: push subscriber count plus the email a send would deliver, for
 * the Email page preview. */
export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const denied = requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  try {
    const site = context.env.SITE_URL ?? "https://barbart.ca";
    // The preview request includes the draft subject and body.
    const params = new URL(context.request.url).searchParams;
    const { subject, text, html } = segmentBroadcastEmail(
      site,
      cleanBroadcastSubject(params.get("subject")),
      cleanBroadcastBody(params.get("body")),
    );
    return json({
      total: (await listSubscriptions(context.env)).length,
      emailSubject: subject,
      emailText: text,
      emailHtml: html,
    });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
