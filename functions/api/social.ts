import type { AppEnv } from "../_lib/env";
import { badRequest, json, notEnabled, requireAdmin, serverError } from "../_lib/http";
import { publishNewPainting } from "../_lib/social";

/** Admin: one-click social post. 501 until enabled (the share kit always works). */
export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const denied = requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Invalid JSON");
  }
  const text = typeof body["text"] === "string" ? body["text"] : "";
  const imageUrl = typeof body["imageUrl"] === "string" ? body["imageUrl"] : "";
  if (text === "" || imageUrl === "") return badRequest("text and imageUrl are required");
  try {
    const post = await publishNewPainting(context.env, { text, imageUrl });
    if (!post.enabled) {
      return notEnabled(
        "Auto-posting",
        "Use the share kit in /admin (no setup needed), or set ENABLE_SOCIAL_POST=\"true\" and AYRSHARE_API_KEY for one-click posting.",
      );
    }
    return json({ id: post.id });
  } catch (err) {
    console.error(err);
    return serverError(err instanceof Error ? err.message : undefined);
  }
};
