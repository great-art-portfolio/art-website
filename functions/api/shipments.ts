import type { AppEnv } from "../_lib/env";
import {
  badRequest,
  json,
  notEnabled,
  requireAdmin,
  serverError,
} from "../_lib/http";
import {
  buyShippoLabel,
  fetchShippoRates,
  type ShippoAddress,
} from "../_lib/shipping";

/**
 * Admin: Shippo rates + label purchase. 501 until enabled.
 * Body: { action: "rates", to: {...}, weightLb } or { action: "buy", rateId }.
 */
export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const denied = requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Invalid JSON");
  }
  try {
    if (body["action"] === "buy") {
      const rateId = typeof body["rateId"] === "string" ? body["rateId"] : "";
      if (rateId === "") return badRequest("rateId is required");
      const label = await buyShippoLabel(context.env, { rateId });
      if (!label.enabled)
        return notEnabled(
          "Shippo",
          'Set ENABLE_SHIPPO="true" and SHIPPO_API_TOKEN.',
        );
      return json({
        labelUrl: label.labelUrl,
        trackingNumber: label.trackingNumber,
      });
    }
    const quote = await fetchShippoRates(context.env, {
      to: body["to"] as ShippoAddress,
      weightLb: Number(body["weightLb"] ?? 5),
    });
    if (!quote.enabled) {
      return notEnabled(
        "Shippo",
        'Set ENABLE_SHIPPO="true" and SHIPPO_API_TOKEN in Cloudflare, then redeploy. Until then use the Chit Chats / Pirate Ship links in /admin.',
      );
    }
    return json({ rates: quote.rates });
  } catch (err) {
    console.error(err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
};
