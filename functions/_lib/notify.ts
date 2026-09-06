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

export async function sendInquiryNotifications(
  env: AppEnv,
  alert: InquiryAlert,
): Promise<NotifyResult> {
  const subject = `New inquiry: "${alert.paintingTitle}"`;
  const text = [
    `${alert.buyerName} (${alert.buyerEmail}) wants "${alert.paintingTitle}".`,
    `Price: $${(alert.priceCents / 100).toFixed(2)} CAD`,
    "",
    alert.message === "" ? "(No message)" : alert.message,
  ].join("\n");

  const [emailed, pushed] = await Promise.all([
    sendEmail(env, subject, text, alert.buyerEmail).catch((err) => {
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

async function sendEmail(
  env: AppEnv,
  subject: string,
  text: string,
  replyTo?: string,
): Promise<boolean> {
  if (env.RESEND_API_KEY === undefined || env.RESEND_API_KEY === "")
    return false;
  if (env.NOTIFY_EMAIL_TO === undefined || env.NOTIFY_EMAIL_TO === "")
    return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.NOTIFY_EMAIL_FROM ?? "Gallery <onboarding@resend.dev>",
      to: [env.NOTIFY_EMAIL_TO],
      // Hitting reply answers the buyer directly.
      reply_to: replyTo ?? undefined,
      subject,
      text,
    }),
  });
  if (!res.ok) console.error("resend error", await res.text());
  return res.ok;
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
