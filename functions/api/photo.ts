import { readBinaryFile } from "../_lib/github";
import type { AppEnv } from "../_lib/env";
import { badRequest, requireAdmin, serverError } from "../_lib/http";

/**
 * Admin: fetch a painting's repo photo bytes so the browser can rebuild
 * its AR models (e.g. after a dimension fix). The photo is the only
 * source the editors can reach — built pages carry hashed copies.
 */
const PHOTO_FILE =
  /^src\/content\/paintings\/[A-Za-z0-9][A-Za-z0-9_.-]*\.(jpg|jpeg|png|webp|heic)$/i;

const IMAGE_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
};

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const denied = requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  const token = context.env.GITHUB_TOKEN ?? "";
  const repo = context.env.GITHUB_REPO ?? "";
  if (token === "" || repo === "") return badRequest("GitHub publishing is not configured");
  const path = new URL(context.request.url).searchParams.get("path") ?? "";
  if (!PHOTO_FILE.test(path)) return badRequest("Unknown photo");
  try {
    const bytes = await readBinaryFile(
      { token, repo, branch: context.env.GITHUB_BRANCH ?? "main" },
      path,
    );
    if (bytes === null) return badRequest("Unknown photo");
    const ext = (path.split(".").pop() ?? "jpg").toLowerCase();
    return new Response(bytes.buffer as ArrayBuffer, {
      headers: { "Content-Type": IMAGE_TYPE[ext] ?? "image/jpeg" },
    });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
