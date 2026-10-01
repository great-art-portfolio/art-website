import { flag, type AppEnv } from "../_lib/env";
import { json } from "../_lib/http";

/** Public: feature flags and the Turnstile site key. Also used to check
 * whether the API is reachable. */
export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  return json({
    stripe: flag(context.env.ENABLE_STRIPE),
    shippo: flag(context.env.ENABLE_SHIPPO),
    socialPost: flag(context.env.ENABLE_SOCIAL_POST),
    // The site key is public. It ships in page HTML.
    turnstileSiteKey: context.env.TURNSTILE_SITE_KEY ?? "",
    email: (context.env.RESEND_API_KEY ?? "") !== "",
    push: (context.env.PUSHOVER_APP_TOKEN ?? "") !== "",
  });
};
