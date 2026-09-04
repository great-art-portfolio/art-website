import { flag, type AppEnv } from "../_lib/env";
import { json } from "../_lib/http";

/** Admin: which optional integrations are switched on (no secrets leak). */
export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  return json({
    stripe: flag(context.env.ENABLE_STRIPE),
    shippo: flag(context.env.ENABLE_SHIPPO),
    socialPost: flag(context.env.ENABLE_SOCIAL_POST),
    email: (context.env.RESEND_API_KEY ?? "") !== "",
    push:
      (context.env.NTFY_TOPIC ?? "") !== "" ||
      (context.env.PUSHOVER_APP_TOKEN ?? "") !== "",
  });
};
