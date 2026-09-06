import type { AppEnv } from "../_lib/env";
import { badRequest, json, serverError } from "../_lib/http";

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
      const endpoint =
        typeof body["endpoint"] === "string" ? body["endpoint"] : "";
      if (endpoint === "") return badRequest("endpoint is required");
      await context.env.DB.prepare(
        "DELETE FROM push_subscriptions WHERE endpoint = ?",
      )
        .bind(endpoint)
        .run();
      return json({ ok: true });
    }
    const sub = body["subscription"] as
      | { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
      | undefined;
    const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : "";
    if (endpoint === "" || !endpoint.startsWith("https://")) {
      return badRequest("A valid subscription is required");
    }
    // Throws on malformed URLs — also proves it's parseable for VAPID aud.
    new URL(endpoint);
    const p256dh = typeof sub?.keys?.p256dh === "string" ? sub.keys.p256dh : "";
    const auth = typeof sub?.keys?.auth === "string" ? sub.keys.auth : "";
    await context.env.DB.prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
    )
      .bind(endpoint, p256dh, auth)
      .run();
    return json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
