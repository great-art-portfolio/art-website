import type { AppEnv } from "../_lib/env";
import { badRequest, json, requireAdmin, serverError } from "../_lib/http";
import {
  confirmCollectorEmail,
  listConfirmedCollectorEmails,
  parseCollectorEmail,
  removeCollectorByToken,
  removeCollectorEmail,
  signupCollectorEmail,
} from "../_lib/collectors";
import {
  artistInbox,
  confirmEmail,
  goodbyeEmail,
  sendSiteEmail,
} from "../_lib/notify";
import { turnstileOk } from "../_lib/turnstile";

/**
 * Collector email list ("tell me about new paintings" addresses).
 *
 * POST is public on purpose. Actions, by body (JSON) — Gmail's
 * one-click POST arrives form-encoded, token in the query string:
 * - { email } → join: stores pending, emails a confirmation link.
 * - { action: "confirm", token } → the link tap: pending becomes confirmed.
 * - { action: "unsubscribe", token } → the one-click link: removed.
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
    try {
      const { token, already } = await signupCollectorEmail(context.env, email);
      let emailed = already;
      if (!already) {
        emailed = await sendSiteEmail(context.env, {
          to: [email],
          replyTo: artistInbox(context.env),
          ...confirmEmail(`${site}/email/confirmed?token=${token}`),
        }).catch(() => false);
      }
      return json({ ok: true, already, emailed }, { status: 201 });
    } catch (err) {
      console.error(err);
      return serverError();
    }
  }
  if (action === "confirm") {
    const token =
      body["token"] ??
      new URL(context.request.url).searchParams.get("token") ??
      "";
    try {
      if (!(await confirmCollectorEmail(context.env, token))) {
        return badRequest(
          "That link didn't work — join again from any Notify me box.",
        );
      }
      return json({ ok: true });
    } catch (err) {
      console.error(err);
      return serverError();
    }
  }
  if (action === "unsubscribe") {
    const token =
      body["token"] ??
      new URL(context.request.url).searchParams.get("token") ??
      "";
    const email = parseCollectorEmail(body["email"] ?? "");
    try {
      if (token !== "") {
        const removed = await removeCollectorByToken(context.env, token);
        if (removed !== null) {
          await sendSiteEmail(context.env, {
            to: [removed],
            replyTo: artistInbox(context.env),
            ...goodbyeEmail(),
          }).catch(() => false);
        }
        return json({ ok: true });
      }
      if (email !== null) {
        if (
          !(await turnstileOk(
            context.env,
            body["turnstileToken"],
            context.request.headers.get("cf-connecting-ip"),
          ))
        ) {
          return badRequest("Spam check failed — please try again.");
        }
        await removeCollectorEmail(context.env, email);
        await sendSiteEmail(context.env, {
          to: [email],
          replyTo: artistInbox(context.env),
          ...goodbyeEmail(),
        }).catch(() => false);
        return json({ ok: true });
      }
      return badRequest("Invalid request");
    } catch (err) {
      console.error(err);
      return serverError();
    }
  }
  return badRequest("Invalid request");
};

/** Admin: how many confirmed addresses are on the email list. */
export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const denied = requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  try {
    return json({
      total: (await listConfirmedCollectorEmails(context.env)).length,
    });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
