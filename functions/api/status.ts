import { flag, type AppEnv } from "../_lib/env";
import { json } from "../_lib/http";
import { stripeEnabled } from "../_lib/stripe";

/** Public: feature flags and the Turnstile site key. Also used to check
 * whether the API is reachable. */
export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  return json({
    stripe: stripeEnabled(context.env),
    shippo: flag(context.env.ENABLE_SHIPPO),
    socialPost: flag(context.env.ENABLE_SOCIAL_POST),
    // The site key is public. It's only handed out once the secret is set
    // too: without the secret nothing checks the token, so the widget
    // would just slow visitors down (and on localhost Cloudflare refuses
    // the production key, so every send would wait for a token in vain).
    turnstileSiteKey:
      (context.env.TURNSTILE_SECRET_KEY ?? "") === ""
        ? ""
        : (context.env.TURNSTILE_SITE_KEY ?? ""),
    email: (context.env.RESEND_API_KEY ?? "") !== "",
    push: (context.env.PUSHOVER_APP_TOKEN ?? "") !== "",
  });
};
