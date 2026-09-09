/** Shared Cloudflare Pages bindings for the gallery API. */

export interface AppEnv {
  /** Two tiny tables: push_subscriptions + email_collectors. Everything else lives in git. */
  DB: D1Database;
  /** Canonical site URL for links in collector emails. */
  SITE_URL?: string;
  ADMIN_API_TOKEN?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
  GITHUB_BRANCH?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_JWK?: string;
  VAPID_CONTACT?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  CF_ACCOUNT_ID?: string;
  CF_ANALYTICS_TOKEN?: string;
  CF_ANALYTICS_SITE?: string;
  RESEND_API_KEY?: string;
  NOTIFY_EMAIL_FROM?: string;
  /** The artist's inbox: buyer inquiries land here, and broadcast
   * copies too. Never shown on the site. */
  ARTIST_INBOX?: string;
  /** Legacy name for ARTIST_INBOX — still honored so a stale dashboard
   * secret never silences mail. */
  NOTIFY_EMAIL_TO?: string;
  NTFY_TOPIC?: string;
  PUSHOVER_APP_TOKEN?: string;
  PUSHOVER_USER_KEY?: string;
  ENABLE_STRIPE?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_SUCCESS_URL?: string;
  STRIPE_CANCEL_URL?: string;
  ENABLE_SHIPPO?: string;
  SHIPPO_API_TOKEN?: string;
  ENABLE_SOCIAL_POST?: string;
  AYRSHARE_API_KEY?: string;
}

export function flag(value: string | undefined): boolean {
  return value === "true";
}
