import { isLocale, localePath, type Locale } from "../../src/i18n/locales";
import type { AppEnv } from "../_lib/env";
import {
  badRequest,
  json,
  requireAdmin,
  serverError,
  spamCheckFailed,
} from "../_lib/http";
import {
  CONFIRM_TTL_MS,
  issueLinkToken,
  parseCollectorEmail,
  verifyLinkToken,
} from "../_lib/collectors";
import {
  mockConfirm,
  mockContacts,
  mockCount,
  mockList,
  mockSubscribe,
  mockUnsubscribe,
} from "../_lib/collectors-mock";
import {
  alreadyEmail,
  artistInbox,
  confirmEmail,
  countSegmentContacts,
  goodbyeEmail,
  isConfirmedContact,
  isResendTestAddress,
  listSegmentContacts,
  sendSiteEmail,
  syncContactRemoved,
  syncContactSubscribed,
} from "../_lib/notify";
import { turnstileOk } from "../_lib/turnstile";

/** The confirm page in the language they joined from. */
function confirmLink(
  site: string,
  email: string,
  token: string,
  locale: Locale = "en",
): string {
  return `${site}${localePath(locale, "/email/confirmed")}?email=${encodeURIComponent(email)}&token=${token}`;
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
 * Email list. Nothing is stored here. Confirmed addresses live in Resend,
 * and pending confirmations are HMAC tokens in the links. Gmail's one-click
 * unsubscribe POST is form-encoded with the token and email in the query
 * string. GET returns the /admin count and needs the admin token.
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
  // Their emails and pages come in the language they read the site in.
  const locale: Locale = isLocale(body["locale"]) ? body["locale"] : "en";
  // "invite" is the studio adding someone she met: same confirm email,
  // behind her sign-in instead of the spam check, and it may say who's
  // already listed, since only she sees the answer.
  const invite = action === "invite";
  if (action === "" || action === "subscribe" || invite) {
    if (invite) {
      const denied = await requireAdmin(context.request, context.env);
      if (denied !== null) return denied;
    } else if (
      !(await turnstileOk(
        context.env,
        body["turnstileToken"],
        context.request.headers.get("cf-connecting-ip"),
      ))
    ) {
      return spamCheckFailed();
    }
    const email = parseCollectorEmail(body["email"]);
    if (email === null) return badRequest("A valid email address is required");
    const mock = mockList(context.env, context.request);
    if (!hasList(context.env) && !mock) {
      return serverError("The email list isn't set up yet — try again later.");
    }
    if (mock) {
      const sub = await mockSubscribe(context.env, email).catch(() => null);
      if (sub === null) return serverError();
      // Same answer as a new join, so the page never says who's listed.
      if (sub.already)
        return json(
          invite
            ? { ok: true, emailed: false, already: true }
            : { ok: true, emailed: true },
          { status: 201 },
        );
      // Return the confirm link in the response, pointing at this server,
      // so the loop can finish locally. With a key present, Resend test
      // addresses also go through the real API so the send shows in
      // Resend's dashboard. No other address is sent to from dev.
      const origin = new URL(context.request.url).origin;
      let emailed = true;
      if (
        isResendTestAddress(email) &&
        (context.env.RESEND_API_KEY ?? "") !== ""
      ) {
        emailed = await sendSiteEmail(context.env, {
          to: [email],
          replyTo: artistInbox(context.env),
          ...confirmEmail(
            confirmLink(origin, email, sub.token, locale),
            locale,
          ),
        }).catch(() => false);
      }
      return json(
        {
          ok: true,
          emailed,
          devConfirmUrl: confirmLink(origin, email, sub.token, locale),
        },
        { status: 201 },
      );
    }
    try {
      // An address already on the list gets the same answer as a new
      // one, and its inbox gets a note saying so. Only the person who
      // reads that inbox learns it's subscribed.
      if (await isConfirmedContact(context.env, email).catch(() => false)) {
        if (invite)
          return json(
            { ok: true, emailed: false, already: true },
            { status: 201 },
          );
        const emailed = await sendSiteEmail(context.env, {
          to: [email],
          replyTo: artistInbox(context.env),
          ...alreadyEmail(locale),
        }).catch(() => false);
        return json({ ok: true, emailed }, { status: 201 });
      }
      const token = await issueLinkToken(context.env, email, "confirm");
      if (token === null) return serverError();
      const emailed = await sendSiteEmail(context.env, {
        to: [email],
        replyTo: artistInbox(context.env),
        ...confirmEmail(confirmLink(site, email, token, locale), locale),
      }).catch(() => false);
      return json({ ok: true, emailed }, { status: 201 });
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
    const mock = mockList(context.env, context.request);
    if (mock) {
      if (
        email === null ||
        !(await mockConfirm(context.env, email, token).catch(() => false))
      ) {
        return badRequest(
          "That link didn't work — join again from any Notify me box.",
        );
      }
      return json({ ok: true });
    }
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
      // Never delete first: a failed re-add would drop a subscriber. And
      // say so when Resend refused, so they can tap the link again.
      if (!(await syncContactSubscribed(context.env, email).catch(() => false)))
        return serverError(
          "We couldn't add you just now — tap the link again in a minute.",
        );
      return json({ ok: true });
    } catch (err) {
      console.error(err);
      return serverError();
    }
  }
  // The studio removing someone: her sign-in, no goodbye email.
  if (action === "remove") {
    const denied = await requireAdmin(context.request, context.env);
    if (denied !== null) return denied;
    const email = parseCollectorEmail(body["email"] ?? "");
    if (email === null) return badRequest("Invalid request");
    if (mockList(context.env, context.request)) {
      await mockUnsubscribe(context.env, email).catch(() => undefined);
      return json({ ok: true });
    }
    if (!hasList(context.env))
      return serverError("The email list isn't set up yet — try again later.");
    if (!(await syncContactRemoved(context.env, email).catch(() => false)))
      return serverError("Resend didn't remove them — try again in a minute.");
    return json({ ok: true });
  }
  if (action === "unsubscribe") {
    const email = parseCollectorEmail(
      body["email"] ?? params.get("email") ?? "",
    );
    const token = body["token"] ?? params.get("token") ?? "";
    // The mock skips the spam check, as the modal's Leave request carries
    // no token. It only runs locally.
    if (mockList(context.env, context.request)) {
      if (email === null) return badRequest("Invalid request");
      await mockUnsubscribe(context.env, email).catch(() => undefined);
      return json({ ok: true });
    }
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
        return spamCheckFailed();
      }
      if (!hasList(context.env)) {
        return serverError(
          "The email list isn't set up yet — try again later.",
        );
      }
      // Without a link token anyone can type any address, so the goodbye
      // only goes to an address that was really on the list. The reply is
      // the same either way, so it doesn't reveal who is.
      const member =
        token !== "" ||
        (await isConfirmedContact(context.env, email).catch(() => false));
      await syncContactRemoved(context.env, email).catch(() => false);
      if (member) {
        await sendSiteEmail(context.env, {
          to: [email],
          replyTo: artistInbox(context.env),
          ...goodbyeEmail(locale),
        }).catch(() => false);
      }
      return json({ ok: true });
    } catch (err) {
      console.error(err);
      return serverError();
    }
  }
  return badRequest("Invalid request");
};

/** Admin: list size. In mock mode, the mock table's confirmed rows. */
export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const denied = await requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  try {
    // ?list=1 is the studio's list page: everyone, with their state.
    const wantList =
      new URL(context.request.url).searchParams.get("list") === "1";
    if (mockList(context.env, context.request)) {
      if (wantList) {
        const contacts = await mockContacts(context.env);
        return json({ total: contacts.length, contacts });
      }
      return json({ total: await mockCount(context.env) });
    }
    if (wantList) {
      const contacts = await listSegmentContacts(context.env);
      return json({
        total: contacts.filter((c) => !c.unsubscribed).length,
        contacts,
      });
    }
    return json({ total: await countSegmentContacts(context.env) });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
