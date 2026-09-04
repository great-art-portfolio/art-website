import { getPainting } from "../_lib/db";
import type { AppEnv } from "../_lib/env";
import { badRequest, json, notEnabled, serverError } from "../_lib/http";
import { createPaymentLink } from "../_lib/payments";

/** Public: get a Stripe Payment Link for a painting. 501 until enabled. */
export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Invalid JSON");
  }
  const paintingId = typeof body["paintingId"] === "string" ? body["paintingId"] : "";
  if (paintingId === "") return badRequest("paintingId is required");
  try {
    const painting = await getPainting(context.env, paintingId);
    if (painting === null) return badRequest("Unknown painting");
    if (painting.status === "sold") return badRequest("That painting is already sold");
    const link = await createPaymentLink(context.env, {
      title: painting.title,
      amountCents: painting.price_cents,
      paintingId: painting.id,
    });
    if (!link.enabled) {
      return notEnabled(
        "Stripe checkout",
        'Set ENABLE_STRIPE="true" and STRIPE_SECRET_KEY in Cloudflare, then redeploy.',
      );
    }
    return json({ url: link.url });
  } catch (err) {
    console.error(err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
};
