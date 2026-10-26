/** Every Function response (the API, the share photos) gets the same
 * protective headers as the static pages: public/_headers doesn't reach
 * Functions. Only /api/* runs this, so static pages stay free of Function
 * calls. */
export const onRequest: PagesFunction = async (context) => {
  const res = await context.next();
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
