import type { AppEnv } from "./env";

/**
 * Buyer-inquiry notifications.
 *
 * Why Resend: a Worker cannot run an SMTP server on its own — mail has to be
 * handed to a sending service. Resend's free tier (100 emails/day) fits this
 * shop; the alternative is Gmail API + OAuth tokens, which is more fragile.
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

export function broadcastEmail(
  site: string,
  unsubscribeUrl: string,
): { subject: string; text: string } {
  return {
    subject: "New painting at Barbara Straka's studio",
    text: [
      "A new painting is hung in the gallery — come look:",
      site,
      "",
      "— Barbara",
      "",
      "Tired of these? Unsubscribe here:",
      unsubscribeUrl,
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
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
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

/**
 * Collector broadcast: one email per confirmed address, each carrying
 * its own one-click unsubscribe link (which is why this can't stay a
 * single BCC send — and BCC caps at 50 recipients anyway). Replies
 * land in the artist's inbox. Sequential: lists are small and Resend
 * rate-limits bursts.
 */
export function buildBroadcastSends(
  site: string,
  recipients: Array<{ email: string; token: string }>,
): SiteEmail[] {
  return recipients.map((r) => {
    const url = `${site}/email/goodbye?token=${r.token}`;
    const { subject, text } = broadcastEmail(site, url);
    return {
      to: [r.email],
      subject,
      text,
      headers: {
        "List-Unsubscribe": `<${url}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    };
  });
}

export async function sendCollectorBroadcast(
  env: AppEnv,
  site: string,
  recipients: Array<{ email: string; token: string }>,
): Promise<{ sent: number; total: number }> {
  const total = recipients.length;
  const inbox = artistInbox(env);
  if (env.RESEND_API_KEY === undefined || env.RESEND_API_KEY === "") {
    return { sent: 0, total };
  }
  if (inbox === "" || total === 0) return { sent: 0, total };
  let sent = 0;
  for (const mail of buildBroadcastSends(site, recipients)) {
    const ok = await sendSiteEmail(env, {
      ...mail,
      replyTo: inbox,
    }).catch(() => false);
    if (ok) sent += 1;
  }
  return { sent, total };
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
