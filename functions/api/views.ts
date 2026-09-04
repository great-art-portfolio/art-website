import type { AppEnv } from "../_lib/env";
import { badRequest, json, requireAdmin, serverError } from "../_lib/http";

/**
 * First-party view counter. POST { slug } from any visitor — no cookies,
 * no fingerprint, just +1. Use with navigator.sendBeacon / the offline
 * queue so it never slows down or breaks the page.
 */
export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Invalid JSON");
  }
  const slug = typeof body["slug"] === "string" ? body["slug"].slice(0, 120) : "";
  if (slug === "") return badRequest("slug is required");
  try {
    await context.env.DB.prepare(
      `INSERT INTO painting_views (slug, views) VALUES (?, 1)
       ON CONFLICT(slug) DO UPDATE SET
         views = views + 1,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    )
      .bind(slug)
      .run();
    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};

/** Admin: view counts, most-viewed first. */
export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const denied = requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  try {
    const res = await context.env.DB.prepare(
      "SELECT slug, views FROM painting_views ORDER BY views DESC LIMIT 200",
    ).all<{ slug: string; views: number }>();
    return json({ views: res.results ?? [] });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
