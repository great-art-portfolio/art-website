import { createInquiry, getPainting, listInquiries } from "../_lib/db";
import type { AppEnv } from "../_lib/env";
import { badRequest, json, requireAdmin, serverError } from "../_lib/http";
import { sendInquiryNotifications } from "../_lib/notify";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Public: a visitor asks to buy a painting. */
export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Invalid JSON");
  }
  // Honeypot: bots fill it, humans never see it.
  if (typeof body["website"] === "string" && body["website"] !== "") {
    return json({ ok: true });
  }
  const paintingId = typeof body["paintingId"] === "string" ? body["paintingId"] : "";
  const buyerName = typeof body["name"] === "string" ? body["name"].trim().slice(0, 120) : "";
  const buyerEmail = typeof body["email"] === "string" ? body["email"].trim().slice(0, 160) : "";
  const message = typeof body["message"] === "string" ? body["message"].trim().slice(0, 2000) : "";
  if (paintingId === "" || buyerName === "" || !EMAIL_RE.test(buyerEmail)) {
    return badRequest("Name, a valid email, and a painting are required");
  }
  try {
    const painting = await getPainting(context.env, paintingId);
    if (painting === null) return badRequest("Unknown painting");
    if (painting.status === "sold") return badRequest("That painting is already sold");
    const inquiry = await createInquiry(context.env, {
      paintingId: painting.id,
      buyerName,
      buyerEmail,
      message,
    });
    context.waitUntil(
      sendInquiryNotifications(context.env, {
        paintingTitle: painting.title,
        priceCents: painting.price_cents,
        buyerName,
        buyerEmail,
        message,
      }),
    );
    return json({ ok: true, inquiryId: inquiry.id }, { status: 201 });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};

/** Admin: read the inquiry inbox. */
export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const denied = requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  try {
    return json({ inquiries: await listInquiries(context.env) });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
