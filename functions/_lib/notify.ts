import type { AppEnv } from "./env";

/**
 * Buyer-inquiry notifications.
 *
 * Why Resend: a Worker cannot run an SMTP server on its own — mail has to be
 * handed to a sending service. Resend's free tier fits this shop two ways:
 * one-to-one mail (inquiries, confirmations, goodbyes) goes transactional
 * (3,000/month, 100/day — plenty here), while new-painting broadcasts go
 * to a Resend segment via the Broadcasts API (free marketing tier:
 * 1,000 contacts, unlimited sends). The alternative is Gmail API + OAuth
 * tokens, which is more fragile.
 *
 * Why ntfy (not Pushover by default): ntfy is free and needs no account —
 * install the ntfy iOS app, subscribe to a private topic, done. Pushover
 * ($5 one-time) is supported as an optional second channel.
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

/**
 * The artist's inbox: buyer inquiries land here, and broadcast copies
 * too.
 */
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
    subject: "Confirm your new-painting alerts",
    text: [
      "Someone (hopefully you) asked for one email per new painting",
      "from Barbara Straka's studio.",
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
 * The Resend segment holding the confirmed new-painting list. Empty
 * locally — broadcasts then fall back to one transactional email each.
 */
export function segmentId(env: AppEnv): string {
  return env.RESEND_SEGMENT_ID ?? "";
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

/**
 * Every contact on the segment (no limit: one page holds the whole
 * list at this scale). Empty when unconfigured or on any failure —
 * callers treat that as "nobody to mail".
 */
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

/** How many addresses are on the new-painting list (for /admin). */
export async function countSegmentContacts(env: AppEnv): Promise<number> {
  return (await listSegmentContacts(env)).length;
}

/** Already confirmed (and still subscribed)? Then rejoining sends nothing. */
export async function isConfirmedContact(
  env: AppEnv,
  email: string,
): Promise<boolean> {
  return (await listSegmentContacts(env)).some(
    (c) => c.email === email && !c.unsubscribed,
  );
}

/**
 * Segment broadcast body. One template for the whole segment — no
 * per-recipient links fit here, so the exit is Resend's own
 * unsubscribe placeholder (plus headers they add themselves).
 */
export function segmentBroadcastEmail(site: string): {
  subject: string;
  text: string;
} {
  return {
    subject: "New painting at Barbara Straka's studio",
    text: [
      "A new painting is hung in the gallery — come look:",
      site,
      "",
      "— Barbara",
      "",
      "Tired of these? Unsubscribe here:",
      "{{{RESEND_UNSUBSCRIBE_URL}}}",
    ].join("\n"),
  };
}

/**
 * New-painting broadcast to the whole segment in one Broadcasts API
 * call — this is the unlimited-sends path. Replies land in the
 * artist's inbox. Without a configured segment (local dev) this says
 * no and the caller falls back to one transactional email each.
 */
export async function sendSegmentBroadcast(
  env: AppEnv,
  site: string,
): Promise<boolean> {
  const seg = segmentId(env);
  if (env.RESEND_API_KEY === undefined || env.RESEND_API_KEY === "") {
    return false;
  }
  if (seg === "") return false;
  const inbox = artistInbox(env);
  if (inbox === "") return false;
  const { subject, text } = segmentBroadcastEmail(site);
  try {
    const res = await fetch("https://api.resend.com/broadcasts", {
      method: "POST",
      headers: resendHeaders(env),
      body: JSON.stringify({
        segment_id: seg,
        from: artistSender(env),
        reply_to: inbox,
        subject,
        text,
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

/**
 * Keep the segment mirroring the confirmed list: confirming adds the
 * contact, leaving deletes it. D1 stays the source of truth — a failed
 * sync only logs, it never blocks the join or the goodbye.
 */
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
): Promise<{ sent: number; total: number }> {
  const total = await countSegmentContacts(env).catch(() => 0);
  const inbox = artistInbox(env);
  if (env.RESEND_API_KEY === undefined || env.RESEND_API_KEY === "") {
    return { sent: 0, total };
  }
  if (inbox === "" || total === 0) return { sent: 0, total };
  const ok = await sendSegmentBroadcast(env, site).catch(() => false);
  return { sent: ok ? total : 0, total };
}

async function sendPush(
  env: AppEnv,
  title: string,
  message: string,
): Promise<boolean> {
  const jobs: Promise<boolean>[] = [];
  if (env.NTFY_TOPIC !== undefined && env.NTFY_TOPIC !== "") {
    jobs.push(
      fetch(`https://ntfy.sh/${env.NTFY_TOPIC}`, {
        method: "POST",
        headers: { Title: title },
        body: message,
      }).then((res) => res.ok),
    );
  }
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
