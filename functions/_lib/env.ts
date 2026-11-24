/** Shared Cloudflare Pages bindings for the gallery API. */

export interface AppEnv {
  /** D1 holds the short-lived `inquiries` delivery backup (pruned after 24h
   * once sent, 30d if failed), the local dev mock email list, and operational
   * `logs` read by `pnpm logs`. Paintings live in git. */
  DB: D1Database;
  /** The built site. Checkout reads /catalog.json through it. */
  ASSETS: Fetcher;
  /** Canonical site URL for links in collector emails. */
  SITE_URL?: string;
  ADMIN_API_TOKEN?: string;
  /** Cloudflare Access team host and the /admin app's audience tag. With
   * both set, her Access sign-in authorizes the admin API (lib/access). */
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  /** The scheduled-publish workflow's key for /api/notify: the standard
   * publish alert only. Same value as the repo's ALERTS_TOKEN secret. */
  ALERTS_TOKEN?: string;
  /** The site's GitHub App (scripts/github-app-setup.mjs): its id and
   * PKCS#8 private key. Preferred over GITHUB_TOKEN, which expires. */
  GITHUB_APP_ID?: string;
  GITHUB_APP_KEY?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
  GITHUB_BRANCH?: string;
  /** Enables the dev mock email list, which returns confirm links instead
   * of sending mail. Only honored on localhost. Set it in .dev.vars. */
  COLLECTORS_MOCK?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  CF_ACCOUNT_ID?: string;
  CF_ANALYTICS_TOKEN?: string;
  CF_ANALYTICS_SITE?: string;
  RESEND_API_KEY?: string;
  /** Resend segment holding the confirmed new-painting list. Broadcasts go
   * to the segment under the marketing quota. One-to-one mail
   * (confirmations, goodbyes, inquiries) is sent as transactional email. */
  RESEND_SEGMENT_ID?: string;
  /** The artist's sending address. It has to be on the verified Resend
   * domain, or mail only reaches the Resend account email. */
  ARTIST_SENDER?: string;
  /** The artist's inbox for inquiries and broadcast replies. Not shown on
   * the website. */
  ARTIST_INBOX?: string;
  PUSHOVER_APP_TOKEN?: string;
  PUSHOVER_USER_KEY?: string;
  ENABLE_STRIPE?: string;
  STRIPE_SECRET_KEY?: string;
  /** Signing secret of the payment webhook (whsec_…). */
  STRIPE_WEBHOOK_SECRET?: string;
  /** "true" adds Stripe Tax at checkout. */
  STRIPE_TAX?: string;
  ENABLE_SHIPPO?: string;
  SHIPPO_API_TOKEN?: string;
  /** Gemini API key (Google AI Studio, free tier) for the studio's title
   * and description helper, which looks at the photo with Gemini 4
   * Hydrogen. Without it the helper's button stays hidden. */
  GEMINI_API_KEY?: string;
  /** DeepSeek API key (platform.deepseek.com) for translating her words.
   * Without it translation is off. */
  DEEPSEEK_API_KEY?: string;
  /** "true" lets a local copy reach the translator (off for tests). */
  TRANSLATE_LOCAL?: string;
  /** Overrides DeepSeek's model (default deepseek-flash). */
  DEEPSEEK_MODEL?: string;
  ENABLE_SOCIAL_POST?: string;
  AYRSHARE_API_KEY?: string;
}

export function flag(value: string | undefined): boolean {
  return value === "true";
}
