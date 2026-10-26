import { isLocale } from "../../src/i18n/locales";
import type { AppEnv } from "../_lib/env";
import { badRequest, json, serverError, spamCheckFailed } from "../_lib/http";
import { sendInquiryNotifications } from "../_lib/notify";
import { turnstileOk } from "../_lib/turnstile";
import { parseCatalog } from "../_lib/validation";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Public: a visitor asks about a painting. Nothing is stored. The note is
 * emailed to the artist through Resend with the buyer as reply-to, plus an
 * optional Pushover alert.
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
      context.request,
    ))
  ) {
    return spamCheckFailed();
  }
  // The painting's title and price come from the site's own catalog, never
  // from the browser, so nobody can put words of their choosing into her
  // inbox under the site's name. The page sends its slug; notes saved
  // offline by older pages carry only the title, which must match.
  const slug = typeof body["slug"] === "string" ? body["slug"] : "";
  const sentTitle =
    typeof body["paintingTitle"] === "string"
      ? body["paintingTitle"].trim()
      : "";
  let catalog: ReturnType<typeof parseCatalog> = [];
  try {
    const res = await context.env.ASSETS.fetch(
      new Request(`${new URL(context.request.url).origin}/catalog.json`),
    );
    if (res.ok) catalog = parseCatalog(await res.json());
  } catch {
    // No catalog to check against: refused below.
  }
  const painting =
    catalog.find((p) => slug !== "" && p.slug === slug) ??
    catalog.find((p) => sentTitle !== "" && p.title === sentTitle);
  if (painting === undefined)
    return badRequest("That painting isn't on the site any more.");
  const paintingTitle = painting.title;
  const priceCents = painting.sold ? 0 : painting.priceCents;
  const buyerName =
    typeof body["name"] === "string" ? body["name"].trim().slice(0, 120) : "";
  const buyerEmail =
    typeof body["email"] === "string" ? body["email"].trim().slice(0, 160) : "";
  const message =
    typeof body["message"] === "string"
      ? body["message"].trim().slice(0, 2000)
      : "";
  if (buyerName === "" || !EMAIL_RE.test(buyerEmail)) {
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
      locale: isLocale(body["locale"]) ? body["locale"] : "en",
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
