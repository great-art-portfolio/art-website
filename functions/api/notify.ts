import type { AppEnv } from "../_lib/env";
import { json, requireAdmin, serverError } from "../_lib/http";
import {
  cleanBroadcastBody,
  cleanBroadcastSubject,
  segmentBroadcastEmail,
  sendCollectorBroadcast,
} from "../_lib/notify";

/** Admin: emails her list. { email: true } sends the standard new-painting
 * note (a publish alert); { email: { subject, body } } comes from the Email
 * page. An unconfigured list is skipped. */
export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  // The nightly scheduled-publish workflow has its own key, good for the
  // standard publish alert only: no custom text.
  const alertsKey = context.env.ALERTS_TOKEN ?? "";
  const viaAlertsKey =
    alertsKey !== "" &&
    context.request.headers.get("authorization") === `Bearer ${alertsKey}`;
  const denied = viaAlertsKey
    ? null
    : await requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const emailOpt = body["email"];
  const emailCopy =
    typeof emailOpt === "object" && emailOpt !== null
      ? (emailOpt as Record<string, unknown>)
      : null;
  if (viaAlertsKey && emailCopy !== null)
    return json(
      { error: "This key only sends the standard publish alert." },
      { status: 403 },
    );
  if (emailOpt === false) return json({ emailed: false, emailTotal: 0 });
  try {
    const site = context.env.SITE_URL ?? "https://barbart.ca";
    const result = await sendCollectorBroadcast(
      context.env,
      site,
      emailCopy === null ? "" : cleanBroadcastSubject(emailCopy["subject"]),
      emailCopy === null ? "" : cleanBroadcastBody(emailCopy["body"]),
    ).catch(() => ({ sent: 0, total: 0 }));
    return json({ emailed: result.sent > 0, emailTotal: result.total });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};

/** Admin: the email a send would deliver, for the Email page preview. */
export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const denied = await requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  try {
    const site = context.env.SITE_URL ?? "https://barbart.ca";
    // The preview request includes the draft subject and body.
    const params = new URL(context.request.url).searchParams;
    const { subject, text, html } = segmentBroadcastEmail(
      site,
      cleanBroadcastSubject(params.get("subject")),
      cleanBroadcastBody(params.get("body")),
    );
    return json({ emailSubject: subject, emailText: text, emailHtml: html });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
