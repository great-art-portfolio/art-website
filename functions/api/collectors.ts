import type { AppEnv } from "../_lib/env";
import { badRequest, json, requireAdmin, serverError } from "../_lib/http";
import {
  CONFIRM_TTL_MS,
  issueLinkToken,
  parseCollectorEmail,
  verifyLinkToken,
} from "../_lib/collectors";
import {
  mockConfirm,
  mockCount,
  mockList,
  mockSubscribe,
  mockUnsubscribe,
} from "../_lib/collectors-mock";
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
 * Email list. Nothing stored: confirmed addresses live in Resend, the
 * pending proof travels in the links as HMAC tokens. Gmail's one-click
 * POST arrives form-encoded, token + email in the query string.
 * GET (the /admin count) needs the admin token.
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
    const mock = mockList(context.env, context.request);
    if (!hasList(context.env) && !mock) {
      return serverError("The email list isn't set up yet — try again later.");
    }
    if (mock) {
      const sub = await mockSubscribe(context.env, email).catch(() => null);
      if (sub === null) return serverError();
      if (sub.already) return json({ ok: true, already: true, emailed: true });
      // No mail leaves dev: the confirm link rides home in the response,
      // addressed to this server (the tester opens it in the same browser).
      const origin = new URL(context.request.url).origin;
      return json(
        {
          ok: true,
          already: false,
          emailed: true,
          devConfirmUrl: confirmLink(origin, email, sub.token),
        },
        { status: 201 },
      );
    }
    try {
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
      // Delete-then-create so a rejoin after a Resend-side unsubscribe
      // comes back subscribed, not silently muted.
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
    // The mock skips the spam check like the modal's Leave request,
    // which carries no token to check — local only, nothing to abuse.
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

/** Admin: list size — the mock table's confirmed rows in mock mode. */
export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const denied = requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  try {
    if (mockList(context.env, context.request)) {
      return json({ total: await mockCount(context.env) });
    }
    return json({ total: await countSegmentContacts(context.env) });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
