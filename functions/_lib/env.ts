/** Shared Cloudflare Pages bindings for the gallery API. */

export interface AppEnv {
  DB: D1Database;
  IMAGES: R2Bucket;
  ADMIN_API_TOKEN?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_JWK?: string;
  VAPID_CONTACT?: string;
  RESEND_API_KEY?: string;
  NOTIFY_EMAIL_FROM?: string;
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
