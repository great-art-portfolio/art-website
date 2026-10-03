import type { AppEnv } from "../_lib/env";
import { badRequest, json, serverError, spamCheckFailed } from "../_lib/http";
import { sendInquiryNotifications } from "../_lib/notify";
import { turnstileOk } from "../_lib/turnstile";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Public: a visitor asks about a painting. Nothing is stored. The note is
 * emailed to the artist through Resend with the buyer as reply-to, plus an
 * optional Pushover alert. Paintings live in git, so the page sends the
 * title and price itself.
 */
export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Invalid JSON");
  }
  // Honeypot field. It's hidden from people, so only bots fill it.
  if (typeof body["website"] === "string" && body["website"] !== "") {
    return json({ ok: true });
  }
  if (
    !(await turnstileOk(
      context.env,
      body["turnstileToken"],
      context.request.headers.get("cf-connecting-ip"),
    ))
  ) {
    return spamCheckFailed();
  }
  const paintingTitle =
    typeof body["paintingTitle"] === "string"
      ? body["paintingTitle"].trim().slice(0, 120)
      : "";
  const priceCents =
    typeof body["priceCents"] === "number" &&
    Number.isFinite(body["priceCents"]) &&
    body["priceCents"] > 0
      ? Math.round(body["priceCents"])
      : 0;
  const buyerName =
    typeof body["name"] === "string" ? body["name"].trim().slice(0, 120) : "";
  const buyerEmail =
    typeof body["email"] === "string" ? body["email"].trim().slice(0, 160) : "";
  const message =
    typeof body["message"] === "string"
      ? body["message"].trim().slice(0, 2000)
      : "";
  if (paintingTitle === "" || buyerName === "" || !EMAIL_RE.test(buyerEmail)) {
    return badRequest("Name, a valid email, and a painting are required");
  }
  try {
    // Awaited rather than waitUntil, so the buyer only sees "thanks" once a
    // channel delivered. A 5xx makes the offline outbox keep it for retry.
    const result = await sendInquiryNotifications(context.env, {
      paintingTitle,
      priceCents,
      buyerName,
      buyerEmail,
      message,
    });
    if (!result.emailed && !result.pushed) {
      return serverError("Notifications are not configured — try again later.");
    }
    return json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
