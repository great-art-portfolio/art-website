import type { AppEnv } from "../_lib/env";
import { parseCatalog } from "../_lib/validation";

/**
 * Public: a painting's 1200px share photo by slug, for the new-painting
 * email. The email is written when she publishes, before the build that
 * makes the photo, and built photo names change with every edit, so the
 * email points here and this looks the photo up in the live /catalog.json.
 * Not found (yet) is never cached, so a mail app that opens early gets
 * the photo on its next try.
 */
export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const { env, request } = context;
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") ?? "";
  const missing = (): Response =>
    new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return missing();
  const catalogRes = await env.ASSETS.fetch(
    new Request(`${url.origin}/catalog.json`),
  );
  if (!catalogRes.ok) return missing();
  const item = parseCatalog(await catalogRes.json()).find(
    (p) => p.slug === slug,
  );
  if (item === undefined || !item.image.startsWith("/")) return missing();
  const photo = await env.ASSETS.fetch(
    new Request(`${url.origin}${item.image}`),
  );
  if (!photo.ok) return missing();
  return new Response(photo.body, {
    headers: {
      "Content-Type": photo.headers.get("Content-Type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
