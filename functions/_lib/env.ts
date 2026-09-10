/** Shared Cloudflare Pages bindings for the gallery API. */

export interface AppEnv {
  /** One tiny table: push_subscriptions. Everything else lives in git. */
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
  /** Resend segment holding the confirmed new-painting list. Broadcasts
   * go to the segment (marketing quota: unlimited sends); one-to-one
   * mail (confirmations, goodbyes, inquiries) stays transactional. */
  RESEND_SEGMENT_ID?: string;
  /** The address mail goes out from, as the artist. Must be on the
   * verified Resend domain, or mail only reaches the Resend account
   * email. */
  ARTIST_SENDER?: string;
  /** The artist's inbox: buyer inquiries land here, broadcast replies
   * return here. Never on the website. */
  ARTIST_INBOX?: string;
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
