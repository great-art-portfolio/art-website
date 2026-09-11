import type { AppEnv } from "./env";

/**
 * Buyer-inquiry notifications.
 *
 * One-to-one mail (inquiries, confirmations, goodbyes) goes transactional;
 * new-painting broadcasts go to a Resend segment via the Broadcasts API.
 * Inquiry phone pings are Pushover-only and optional.
 */

export interface InquiryAlert {
  paintingTitle: string;
  priceCents: number;
  buyerName: string;
  buyerEmail: string;
  message: string;
}

export interface NotifyResult {
  emailed: boolean;
  pushed: boolean;
}

/** Buyer inquiries land here; broadcast replies return here. */
export function artistInbox(env: AppEnv): string {
  return env.ARTIST_INBOX ?? "";
}

/**
 * The address mail goes out from, as the artist. Falls back to the
 * Resend onboarding identity (which only reaches the Resend account
 * email).
 */
export function artistSender(env: AppEnv): string {
  return env.ARTIST_SENDER ?? "Gallery <onboarding@resend.dev>";
}

/**
 * Every email the site sends, composed here as plain text next to its
 * sending — copy changes never touch delivery, and unit tests pin the
 * words (including the sign-off and the unsubscribe link).
 */
export function inquiryEmail(alert: InquiryAlert): {
  subject: string;
  text: string;
} {
  return {
    subject: `New inquiry: "${alert.paintingTitle}"`,
    text: [
      `${alert.buyerName} (${alert.buyerEmail}) wants "${alert.paintingTitle}".`,
      `Price: $${(alert.priceCents / 100).toFixed(2)} CAD`,
      "",
      alert.message === "" ? "(No message)" : alert.message,
    ].join("\n"),
  };
}

export function confirmEmail(confirmUrl: string): {
  subject: string;
  text: string;
} {
  return {
    subject: "Confirm your studio alerts",
    text: [
      "Someone (hopefully you) asked for new paintings and events",
      "by email from Barbara Straka's studio.",
      "",
      "Confirm here:",
      confirmUrl,
      "",
      "If that wasn't you, ignore this — nothing joins the list",
      "without the tap.",
    ].join("\n"),
  };
}

export function goodbyeEmail(): { subject: string; text: string } {
  return {
    subject: "Removed from the new-painting list",
    text: [
      "You've been removed — no more emails from the studio.",
      "Rejoin any time from any Notify me box.",
      "",
      "— Barbara",
    ].join("\n"),
  };
}

export async function sendInquiryNotifications(
  env: AppEnv,
  alert: InquiryAlert,
): Promise<NotifyResult> {
  const { subject, text } = inquiryEmail(alert);

  const [emailed, pushed] = await Promise.all([
    sendSiteEmail(env, {
      to: [artistInbox(env)],
      // Hitting reply answers the buyer directly.
      replyTo: alert.buyerEmail,
      subject,
      text,
    }).catch((err) => {
      console.error("notify email failed", err);
      return false;
    }),
    sendPush(env, subject, text).catch((err) => {
      console.error("notify push failed", err);
      return false;
    }),
  ]);
  return { emailed, pushed };
}

export interface SiteEmail {
  to: string[];
  replyTo?: string;
  subject: string;
  text: string;
  headers?: Record<string, string>;
}

export function resendHeaders(env: AppEnv): Record<string, string> {
  return {
    Authorization: `Bearer ${env.RESEND_API_KEY ?? ""}`,
    "Content-Type": "application/json",
  };
}

/**
/** The Resend segment holding the new-painting list. Empty = list off. */
export function segmentId(env: AppEnv): string {
  return env.RESEND_SEGMENT_ID ?? "";
}

/** Resend's safe test addresses (delivered@, bounced@, complained@…,
 * all resend.dev, labels allowed). These run the true API without
 * touching anyone's reputation — the only addresses that may leave
 * a dev machine, and only with a key present. Never example.com:
 * Resend 422s those outright. */
export function isResendTestAddress(email: string): boolean {
  return /^[A-Za-z0-9._%+-]+@resend\.dev$/i.test(email.trim());
}

/** The one Resend call everything funnels through. */
export async function sendSiteEmail(
  env: AppEnv,
  mail: SiteEmail,
): Promise<boolean> {
  if (env.RESEND_API_KEY === undefined || env.RESEND_API_KEY === "")
    return false;
  if (mail.to.some((t) => t === "")) return false;
  if (mail.to.length === 0) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: resendHeaders(env),
    body: JSON.stringify({
      from: artistSender(env),
      to: mail.to,
      reply_to: mail.replyTo ?? undefined,
      headers: mail.headers ?? undefined,
      subject: mail.subject,
      text: mail.text,
    }),
  });
  if (!res.ok) console.error("resend error", await res.text());
  return res.ok;
}

interface SegmentContact {
  email: string;
  unsubscribed: boolean;
}

/** Every contact on the segment. Empty when unconfigured or on failure. */
export async function listSegmentContacts(
  env: AppEnv,
): Promise<SegmentContact[]> {
  const seg = segmentId(env);
  if (env.RESEND_API_KEY === undefined || env.RESEND_API_KEY === "") {
    return [];
  }
  if (seg === "") return [];
  try {
    const res = await fetch(
      `https://api.resend.com/segments/${encodeURIComponent(seg)}/contacts`,
      { headers: resendHeaders(env) },
    );
    if (!res.ok) {
      console.error("resend segment list failed", await res.text());
      return [];
    }
    const body = (await res.json()) as {
      data?: Array<{ email?: unknown; unsubscribed?: unknown }>;
    };
    if (!Array.isArray(body.data)) return [];
    return body.data
      .filter(
        (c): c is { email: string; unsubscribed: boolean } =>
          typeof c.email === "string" && typeof c.unsubscribed === "boolean",
      )
      .map((c) => ({ email: c.email, unsubscribed: c.unsubscribed }));
  } catch (err) {
    console.error("resend segment list failed", err);
    return [];
  }
}

/** Address count for /admin. */
export async function countSegmentContacts(env: AppEnv): Promise<number> {
  return (await listSegmentContacts(env)).length;
}

/** True when the address is already subscribed (rejoining sends nothing). */
export async function isConfirmedContact(
  env: AppEnv,
  email: string,
): Promise<boolean> {
  return (await listSegmentContacts(env)).some(
    (c) => c.email === email && !c.unsubscribed,
  );
}

/** Her words, trimmed and capped — an email can't be unsent, so
 * overlong input shrinks instead of failing. Blank fields fall back to
 * the standard note field-by-field (a subjectless send helps no one).
 */
export const MAX_BROADCAST_SUBJECT = 200;
export const MAX_BROADCAST_BODY = 2000;

export function cleanBroadcastSubject(value: unknown): string {
  return typeof value === "string"
    ? value.trim().slice(0, MAX_BROADCAST_SUBJECT)
    : "";
}

export function cleanBroadcastBody(value: unknown): string {
  return typeof value === "string"
    ? value.trim().slice(0, MAX_BROADCAST_BODY)
    : "";
}

/** The standard note she edits from. The sign-off and the unsubscribe
 * live in the composer below, never in an input — she asked never to
 * touch them, so every send carries them whatever she writes. */
export function broadcastDefaults(site: string): {
  subject: string;
  body: string;
} {
  return {
    subject: "New painting at Barbara Straka's studio",
    body: `A new painting is hung in the gallery — come look: ${site}`,
  };
}

/** Her draft, resolved against the standard note. */
export function resolveBroadcastCopy(
  site: string,
  subject: unknown,
  body: unknown,
): { subject: string; body: string } {
  const defaults = broadcastDefaults(site);
  const cleanSubject = cleanBroadcastSubject(subject);
  const cleanBody = cleanBroadcastBody(body);
  return {
    subject: cleanSubject === "" ? defaults.subject : cleanSubject,
    body: cleanBody === "" ? defaults.body : cleanBody,
  };
}

/** The custom line inside the styled body — buyer-invisible escaping,
 * so her words can't break the markup (or smuggle any in). */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** One template for the whole segment; the exit is Resend's placeholder.
 * The text stays plain (inboxes still render it); the styled body dresses
 * the same words in the gallery's paper-and-clay for clients that render
 * HTML — her subject as the headline, her line breaks kept, the fixed
 * first-name sign-off, and the unsubscribe. No nameplate: the From line
 * already says who it's from. Her subject and body arrive pre-cleaned;
 * the sign-off and unsubscribe never come from input. */
export function segmentBroadcastEmail(
  site: string,
  subject: unknown = "",
  body: unknown = "",
): {
  subject: string;
  text: string;
  html: string;
} {
  const copy = resolveBroadcastCopy(site, subject, body);
  const text = [
    copy.body,
    "",
    "— Barbara",
    "",
    "Tired of these? Unsubscribe here:",
    "",
    "{{{RESEND_UNSUBSCRIBE_URL}}}",
  ].join("\n");
  const paras = copy.body
    .split("\n")
    .map((line) => escapeHtml(line))
    .join("<br>");
  const html = [
    '<!doctype html><html><body style="margin:0;padding:0;background-color:#f4eee1;">',
    "<div style=\"max-width:560px;margin:0 auto;padding:32px 20px;font-family:Georgia,'Times New Roman',serif;color:#2b2721;\">",
    `<h1 style="font-size:26px;font-weight:normal;margin:0 0 16px;">${escapeHtml(copy.subject)}</h1>`,
    `<p style="font-size:16px;line-height:1.6;margin:0 0 16px;">${paras}</p>`,
    '<p style="font-size:16px;margin:0 0 24px;">— Barbara</p>',
    '<hr style="border:none;border-top:1px solid #d8cdb8;margin:0 0 16px;" />',
    '<p style="font-size:13px;color:#6b6257;margin:0;">Tired of these? <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#a44a24;">Unsubscribe here</a></p>',
    "</div></body></html>",
  ].join("");
  return { subject: copy.subject, text, html };
}

/** Broadcast to the whole segment in one call. False when unconfigured.
 * Her subject and body ride along; blanks fall back to the standard
 * note field-by-field. */
export async function sendSegmentBroadcast(
  env: AppEnv,
  site: string,
  subject: unknown = "",
  body: unknown = "",
): Promise<boolean> {
  const seg = segmentId(env);
  if (env.RESEND_API_KEY === undefined || env.RESEND_API_KEY === "") {
    return false;
  }
  if (seg === "") return false;
  const inbox = artistInbox(env);
  if (inbox === "") return false;
  const {
    subject: cleanSubject,
    text,
    html,
  } = segmentBroadcastEmail(site, subject, body);
  try {
    const res = await fetch("https://api.resend.com/broadcasts", {
      method: "POST",
      headers: resendHeaders(env),
      body: JSON.stringify({
        segment_id: seg,
        from: artistSender(env),
        reply_to: inbox,
        subject: cleanSubject,
        text,
        html,
        send: true,
      }),
    });
    if (!res.ok) console.error("resend broadcast error", await res.text());
    return res.ok;
  } catch (err) {
    console.error("resend broadcast failed", err);
    return false;
  }
}

/** Confirming creates the contact in the segment (or re-adds it). */
export async function syncContactSubscribed(
  env: AppEnv,
  email: string,
): Promise<boolean> {
  const seg = segmentId(env);
  if (env.RESEND_API_KEY === undefined || env.RESEND_API_KEY === "") {
    return false;
  }
  if (seg === "" || email === "") return false;
  try {
    const created = await fetch("https://api.resend.com/contacts", {
      method: "POST",
      headers: resendHeaders(env),
      body: JSON.stringify({
        email,
        unsubscribed: false,
        segments: [{ id: seg }],
      }),
    });
    if (created.ok) return true;
    const added = await fetch(
      `https://api.resend.com/contacts/${encodeURIComponent(email)}/segments/${encodeURIComponent(seg)}`,
      { method: "POST", headers: resendHeaders(env) },
    );
    if (!added.ok)
      console.error("resend contact add failed", await added.text());
    return added.ok;
  } catch (err) {
    console.error("resend contact sync failed", err);
    return false;
  }
}

export async function syncContactRemoved(
  env: AppEnv,
  email: string,
): Promise<boolean> {
  const seg = segmentId(env);
  if (env.RESEND_API_KEY === undefined || env.RESEND_API_KEY === "") {
    return false;
  }
  if (seg === "" || email === "") return false;
  try {
    const res = await fetch(
      `https://api.resend.com/contacts/${encodeURIComponent(email)}`,
      { method: "DELETE", headers: resendHeaders(env) },
    );
    if (res.ok || res.status === 404) return true;
    console.error("resend contact remove failed", await res.text());
    return false;
  } catch (err) {
    console.error("resend contact remove failed", err);
    return false;
  }
}

export async function sendCollectorBroadcast(
  env: AppEnv,
  site: string,
  subject: unknown = "",
  body: unknown = "",
): Promise<{ sent: number; total: number }> {
  const total = await countSegmentContacts(env).catch(() => 0);
  const inbox = artistInbox(env);
  if (env.RESEND_API_KEY === undefined || env.RESEND_API_KEY === "") {
    return { sent: 0, total };
  }
  if (inbox === "" || total === 0) return { sent: 0, total };
  const ok = await sendSegmentBroadcast(env, site, subject, body).catch(
    () => false,
  );
  return { sent: ok ? total : 0, total };
}

async function sendPush(
  env: AppEnv,
  title: string,
  message: string,
): Promise<boolean> {
  const jobs: Promise<boolean>[] = [];
  if (
    env.PUSHOVER_APP_TOKEN !== undefined &&
    env.PUSHOVER_APP_TOKEN !== "" &&
    env.PUSHOVER_USER_KEY !== undefined &&
    env.PUSHOVER_USER_KEY !== ""
  ) {
    jobs.push(
      fetch("https://api.pushover.net/1/messages.json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: env.PUSHOVER_APP_TOKEN,
          user: env.PUSHOVER_USER_KEY,
          title,
          message,
        }),
      }).then((res) => res.ok),
    );
  }
  if (jobs.length === 0) return false;
  const results = await Promise.all(jobs);
  return results.some(Boolean);
}
