import type { AppEnv } from "../_lib/env";
import { badRequest, json, serverError } from "../_lib/http";
import { sendInquiryNotifications } from "../_lib/notify";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function turnstileOk(
  env: AppEnv,
  token: unknown,
  ip: string | null,
): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET_KEY ?? "";
  // Keys arrive with the dashboard setup; until then the honeypot covers us.
  if (secret === "") return true;
  if (typeof token !== "string" || token === "") return false;
  try {
    const form = new FormData();
    form.set("secret", secret);
    form.set("response", token);
    if (ip !== null) form.set("remoteip", ip);
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: form,
      },
    );
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    console.error("turnstile verify failed", err);
    return false;
  }
}

/**
 * Public: a visitor asks about a painting. Nothing is stored — the note is
 * emailed straight to the artist (Resend) plus an ntfy/phone ping, with the
 * buyer's address as reply-to. Paintings live in git, so the page sends its
 * own title + price along; no database lookup involved.
 */
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
  if (
    !(await turnstileOk(
      context.env,
      body["turnstileToken"],
      context.request.headers.get("cf-connecting-ip"),
    ))
  ) {
    return badRequest("Spam check failed — please try again.");
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
    // Awaited, not waitUntil: a lost inquiry is the worst outcome here, so
    // the buyer only hears "thanks" when at least one channel delivered.
    // (5xx makes the offline outbox hold it for retry instead of lying.)
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
