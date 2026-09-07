import { flag, type AppEnv } from "../_lib/env";
import { json } from "../_lib/http";

/**
 * Public on purpose (no secrets leak — flags and the site key only): the
 * buyer page needs the Turnstile key and the admin panel uses it as its
 * "is there a backend behind this preview" check.
 */
export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  return json({
    stripe: flag(context.env.ENABLE_STRIPE),
    shippo: flag(context.env.ENABLE_SHIPPO),
    socialPost: flag(context.env.ENABLE_SOCIAL_POST),
    // Site key is public by design (it ships in page HTML).
    turnstileSiteKey: context.env.TURNSTILE_SITE_KEY ?? "",
    email: (context.env.RESEND_API_KEY ?? "") !== "",
    push:
      (context.env.NTFY_TOPIC ?? "") !== "" ||
      (context.env.PUSHOVER_APP_TOKEN ?? "") !== "",
  });
};
