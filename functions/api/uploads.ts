import type { AppEnv } from "../_lib/env";
import { badRequest, json, requireAdmin, serverError } from "../_lib/http";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/heic", "heic"],
]);

/** Admin image upload: phone photo in, R2 key + public URL out. */
export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const denied = requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return badRequest("Expected multipart form data");
  }
  const file = form.get("image");
  if (!(file instanceof File)) return badRequest("Field 'image' is required");
  const ext = ALLOWED.get(file.type);
  if (ext === undefined) return badRequest("Only JPEG, PNG, WebP, or HEIC photos are accepted");
  if (file.size > MAX_BYTES) return badRequest("Image must be under 10 MB (crop it in the uploader first)");

  const key = `paintings/${crypto.randomUUID()}.${ext}`;
  try {
    await context.env.IMAGES.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });
  } catch (err) {
    console.error(err);
    return serverError("Could not store image");
  }
  const url = new URL(context.request.url);
  return json({ key, url: `${url.origin}/api/images/${key}` }, { status: 201 });
};
