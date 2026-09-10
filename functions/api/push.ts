import type { AppEnv } from "../_lib/env";
import { badRequest, json, serverError } from "../_lib/http";
import { parsePushSubscribe, parsePushUnsubscribe } from "../_lib/validation";

/** Public: VAPID public key so browsers can subscribe (safe to expose). */
export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  return json({ publicKey: context.env.VAPID_PUBLIC_KEY ?? "" });
};

/**
 * Public: subscribe / unsubscribe a browser for "new painting" alerts.
 * Body: { action: "subscribe", subscription: { endpoint, keys } }
 *    or { action: "unsubscribe", endpoint }.
 */
export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Invalid JSON");
  }
  try {
    if (body["action"] === "unsubscribe") {
      const endpoint = parsePushUnsubscribe(body);
      if (endpoint === null) return badRequest("endpoint is required");
      await context.env.DB.prepare(
        "DELETE FROM push_subscriptions WHERE endpoint = ?",
      )
        .bind(endpoint)
        .run();
      return json({ ok: true });
    }
    const sub = parsePushSubscribe(body);
    if (sub === null) return badRequest("A valid subscription is required");
    await context.env.DB.prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
    )
      .bind(sub.endpoint, sub.p256dh, sub.auth)
      .run();
    return json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
