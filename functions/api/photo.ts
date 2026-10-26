import { fetchRawFile, gitConfig } from "../_lib/github";
import type { AppEnv } from "../_lib/env";
import { badRequest, githubFailure, requireAdmin } from "../_lib/http";

/**
 * Admin: returns a painting's original photo from the repo so the browser
 * can rebuild its AR models, such as after a dimension change. Built pages
 * only have resized, hashed copies.
 */
import { PHOTO_FILE } from "../_lib/gallery-paths";

const IMAGE_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
};

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const denied = await requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  const config = gitConfig(context.env);
  if (config === null) return badRequest("GitHub publishing is not configured");
  const path = new URL(context.request.url).searchParams.get("path") ?? "";
  if (!PHOTO_FILE.test(path)) return badRequest("Unknown photo");
  try {
    const raw = await fetchRawFile(config, path);
    if (raw === null) return badRequest("Unknown photo");
    const ext = (path.split(".").pop() ?? "jpg").toLowerCase();
    // Streamed straight through: no copy, no Worker CPU spent on bytes.
    return new Response(raw.body, {
      headers: { "Content-Type": IMAGE_TYPE[ext] ?? "image/jpeg" },
    });
  } catch (err) {
    return githubFailure(err);
  }
};
