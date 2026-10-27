import { isLocale } from "../../src/i18n/locales";
import type { AppEnv } from "../_lib/env";
import { badRequest, json, serverError, spamCheckFailed } from "../_lib/http";
import { logEvent } from "../_lib/log";
import { sendInquiryNotifications } from "../_lib/notify";
import { turnstileOk } from "../_lib/turnstile";
import { parseCatalog } from "../_lib/validation";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Saves the inquiry before anything is sent, so a failed email never
 * loses it. Null when the save itself failed (logged; sending goes on). */
async function recordInquiry(
  env: AppEnv,
  request: Request,
  row: {
    slug: string;
    paintingTitle: string;
    buyerName: string;
    buyerEmail: string;
    message: string;
    locale: string;
  },
): Promise<number | null> {
  try {
    const res = await env.DB.prepare(
      "INSERT INTO inquiries (slug, painting_title, buyer_name, buyer_email, message, locale) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    )
      .bind(
        row.slug,
        row.paintingTitle,
        row.buyerName,
        row.buyerEmail,
        row.message,
        row.locale,
      )
      .first<{ id: number }>();
    return res?.id ?? null;
  } catch (err) {
    await logEvent(env, {
      event: "inquiry.record_failed",
      message: "Couldn't save an inquiry before sending it",
      err,
      detail: { slug: row.slug },
      request,
    });
    return null;
  }
}

async function markInquiry(
  env: AppEnv,
  id: number | null,
  status: "sent" | "failed",
  error = "",
): Promise<void> {
  if (id === null) return;
  await env.DB.prepare(
    "UPDATE inquiries SET status = ?, error = ? WHERE id = ?",
  )
    .bind(status, error.slice(0, 500), id)
    .run()
    .catch(() => undefined);
}

/**
 * Public: a visitor asks about a painting. The note is saved to the D1
 * `inquiries` table, then emailed to the artist through Resend with the
 * buyer as reply-to, plus an optional Pushover alert. A row left at
 * "failed" never reached her.
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
  // The painting's title and price come from the site's own catalog, never
  // from the browser, so nobody can put words of their choosing into her
  // inbox under the site's name. The page sends its slug; notes saved
  // offline by older pages carry only the title, which must match.
  const slug = typeof body["slug"] === "string" ? body["slug"] : "";
  const sentTitle =
    typeof body["paintingTitle"] === "string"
      ? body["paintingTitle"].trim()
      : "";
  let catalog: ReturnType<typeof parseCatalog> | null = null;
  try {
    const res = await context.env.ASSETS.fetch(
      new Request(`${new URL(context.request.url).origin}/catalog.json`),
    );
    if (res.ok) catalog = parseCatalog(await res.json());
  } catch {
    catalog = null;
  }
  // A 5xx, not a 4xx: the page's outbox keeps the note and tries again.
  if (catalog === null)
    return serverError("Couldn't send just now — it will try again.");
  const painting =
    catalog.find(
      (p) => slug !== "" && (p.slug === slug || p.aliases.includes(slug)),
    ) ?? catalog.find((p) => sentTitle !== "" && p.title === sentTitle);
  if (painting === undefined)
    return badRequest("That painting isn't on the site any more.");
  const paintingTitle = painting.title;
  const priceCents = painting.sold ? 0 : painting.priceCents;
  const locale = isLocale(body["locale"]) ? body["locale"] : "en";
  const id = await recordInquiry(context.env, context.request, {
    slug: painting.slug,
    paintingTitle,
    buyerName,
    buyerEmail,
    message,
    locale,
  });
  try {
    // Awaited rather than waitUntil, so the buyer only sees "thanks" once a
    // channel delivered. A 5xx makes the offline outbox keep it for retry.
    const result = await sendInquiryNotifications(context.env, {
      paintingTitle,
      priceCents,
      buyerName,
      buyerEmail,
      message,
      locale,
    });
    if (!result.emailed && !result.pushed) {
      await markInquiry(context.env, id, "failed", "no channel delivered");
      await logEvent(context.env, {
        event: "inquiry.not_delivered",
        message:
          "An inquiry reached no channel (email and push both failed or are off)",
        detail: { inquiryId: id, slug: painting.slug },
        request: context.request,
      });
      return serverError("Notifications are not configured — try again later.");
    }
    await markInquiry(context.env, id, "sent");
    return json({ ok: true }, { status: 201 });
  } catch (err) {
    await markInquiry(context.env, id, "failed", String(err));
    await logEvent(context.env, {
      event: "inquiry.send_threw",
      message: "Sending an inquiry threw",
      err,
      detail: { inquiryId: id, slug: painting.slug },
      request: context.request,
    });
    return serverError();
  }
};
