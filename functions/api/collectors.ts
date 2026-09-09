import type { AppEnv } from "../_lib/env";
import { badRequest, json, requireAdmin, serverError } from "../_lib/http";
import {
  CONFIRM_TTL_MS,
  issueLinkToken,
  parseCollectorEmail,
  verifyLinkToken,
} from "../_lib/collectors";
import {
  artistInbox,
  confirmEmail,
  countSegmentContacts,
  goodbyeEmail,
  isConfirmedContact,
  sendSiteEmail,
  syncContactRemoved,
  syncContactSubscribed,
} from "../_lib/notify";
import { turnstileOk } from "../_lib/turnstile";

function confirmLink(site: string, email: string, token: string): string {
  return `${site}/email/confirmed?email=${encodeURIComponent(email)}&token=${token}`;
}

function hasList(env: AppEnv): boolean {
  return (
    env.RESEND_API_KEY !== undefined &&
    env.RESEND_API_KEY !== "" &&
    env.RESEND_SEGMENT_ID !== undefined &&
    env.RESEND_SEGMENT_ID !== ""
  );
}

/**
 * Collector email list ("tell me about new paintings" addresses).
 *
 * Nothing is stored here: confirmed addresses live in Resend as
 * segment contacts, and the pending proof travels inside the emailed
 * links as HMAC tokens. Actions, by body (JSON) — Gmail's one-click
 * POST arrives form-encoded, token + email in the query string:
 * - { email } → join: emails a confirmation link (or says already).
 * - { action: "confirm", email, token } → the link tap: joins the segment.
 * - { action: "unsubscribe", email, token } → the one-click link: removed.
 * - { action: "unsubscribe", email } → the modal button: removed.
 * GET (the confirmed count for /admin) stays behind the admin check.
 */
export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  let body: Record<string, string>;
  try {
    const type = context.request.headers.get("content-type") ?? "";
    if (type.includes("application/x-www-form-urlencoded")) {
      const form = await context.request.formData();
      body = {};
      for (const [k, v] of form) body[k] = String(v);
    } else {
      const raw = (await context.request.json()) as Record<string, unknown>;
      body = {};
      for (const [k, v] of Object.entries(raw))
        body[k] = typeof v === "string" ? v : "";
    }
  } catch {
    return badRequest("Invalid request");
  }
  const site = context.env.SITE_URL ?? "https://barbart.ca";
  const params = new URL(context.request.url).searchParams;
  const action = body["action"] ?? "";
  if (action === "" || action === "subscribe") {
    if (
      !(await turnstileOk(
        context.env,
        body["turnstileToken"],
        context.request.headers.get("cf-connecting-ip"),
      ))
    ) {
      return badRequest("Spam check failed — please try again.");
    }
    const email = parseCollectorEmail(body["email"]);
    if (email === null) return badRequest("A valid email address is required");
    if (!hasList(context.env)) {
      return serverError("The email list isn't set up yet — try again later.");
    }
    try {
      // Rejoining without leaving sends nothing new.
      if (await isConfirmedContact(context.env, email).catch(() => false)) {
        return json({ ok: true, already: true, emailed: true });
      }
      const token = await issueLinkToken(context.env, email, "confirm");
      if (token === null) return serverError();
      const emailed = await sendSiteEmail(context.env, {
        to: [email],
        replyTo: artistInbox(context.env),
        ...confirmEmail(confirmLink(site, email, token)),
      }).catch(() => false);
      return json({ ok: true, already: false, emailed }, { status: 201 });
    } catch (err) {
      console.error(err);
      return serverError();
    }
  }
  if (action === "confirm") {
    const email = parseCollectorEmail(
      body["email"] ?? params.get("email") ?? "",
    );
    const token = body["token"] ?? params.get("token") ?? "";
    try {
      if (
        email === null ||
        (await verifyLinkToken(
          context.env,
          email,
          token,
          "confirm",
          CONFIRM_TTL_MS,
        )) === null
      ) {
        return badRequest(
          "That link didn't work — join again from any Notify me box.",
        );
      }
      if (!hasList(context.env)) {
        return serverError(
          "The email list isn't set up yet — try again later.",
        );
      }
      // Delete-then-create: a rejoin after a Resend-side unsubscribe
      // comes back fully subscribed, not silently muted.
      await syncContactRemoved(context.env, email).catch(() => false);
      await syncContactSubscribed(context.env, email).catch(() => false);
      return json({ ok: true });
    } catch (err) {
      console.error(err);
      return serverError();
    }
  }
  if (action === "unsubscribe") {
    const email = parseCollectorEmail(
      body["email"] ?? params.get("email") ?? "",
    );
    const token = body["token"] ?? params.get("token") ?? "";
    try {
      if (email === null) return badRequest("Invalid request");
      if (token !== "") {
        const verified = await verifyLinkToken(
          context.env,
          email,
          token,
          "goodbye",
          null,
        );
        if (verified === null) return badRequest("Invalid request");
      } else if (
        !(await turnstileOk(
          context.env,
          body["turnstileToken"],
          context.request.headers.get("cf-connecting-ip"),
        ))
      ) {
        return badRequest("Spam check failed — please try again.");
      }
      if (!hasList(context.env)) {
        return serverError(
          "The email list isn't set up yet — try again later.",
        );
      }
      await syncContactRemoved(context.env, email).catch(() => false);
      await sendSiteEmail(context.env, {
        to: [email],
        replyTo: artistInbox(context.env),
        ...goodbyeEmail(),
      }).catch(() => false);
      return json({ ok: true });
    } catch (err) {
      console.error(err);
      return serverError();
    }
  }
  return badRequest("Invalid request");
};

/** Admin: how many addresses are on the email list. */
export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const denied = requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  try {
    return json({ total: await countSegmentContacts(context.env) });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
