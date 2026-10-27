import type { AppEnv } from "../_lib/env";
import { serverError } from "../_lib/http";
import { logEvent } from "../_lib/log";

/** Every Function response (the API, the share photos) gets the same
 * protective headers as the static pages: public/_headers doesn't reach
 * Functions. Only /api/* runs this, so static pages stay free of Function
 * calls.
 *
 * It is also the last net for errors: anything an endpoint throws is
 * logged and answered with a plain 500, and every 5xx answer is logged
 * with its route and ray id, so an agent finds it with `pnpm logs`. */
export const onRequest: PagesFunction<AppEnv> = async (context) => {
  let res: Response;
  try {
    res = await context.next();
  } catch (err) {
    context.waitUntil(
      logEvent(context.env, {
        event: "http.uncaught",
        message: "An endpoint threw",
        err,
        request: context.request,
      }),
    );
    res = serverError();
  }
  // 501 is a feature switched off on purpose, not a failure.
  if (res.status >= 500 && res.status !== 501) {
    const said = await res
      .clone()
      .text()
      .catch(() => "");
    context.waitUntil(
      logEvent(context.env, {
        event: "http.5xx",
        message: `Answered ${res.status}`,
        detail: { status: res.status, body: said.slice(0, 300) },
        request: context.request,
      }),
    );
  }
  const out = new Response(res.body, res);
  out.headers.set("X-Content-Type-Options", "nosniff");
  out.headers.set("X-Frame-Options", "SAMEORIGIN");
  out.headers.set(
    "Content-Security-Policy",
    "frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
  );
  out.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return out;
};
