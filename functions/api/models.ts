import type { AppEnv } from "../_lib/env";
import { badRequest, json, requireAdmin, serverError } from "../_lib/http";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Map([
  ["model/gltf-binary", "glb"],
  ["model/vnd.usdz", "usdz"],
  // Some browsers label uploads generically — trust the extension then.
  ["application/octet-stream", null],
]);

/**
 * Admin 3D-model upload. Models are generated on her phone from the photo
 * (see src/lib/ar.ts) and stored in R2 next to the images.
 */
export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const denied = requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return badRequest("Expected multipart form data");
  }
  const file = form.get("model");
  if (!(file instanceof File)) return badRequest("Field 'model' is required");
  if (file.size > MAX_BYTES) return badRequest("Model must be under 15 MB");

  const name = file.name.toLowerCase();
  let ext = ALLOWED.get(file.type) ?? null;
  if (ext === null) {
    if (name.endsWith(".glb")) ext = "glb";
    else if (name.endsWith(".usdz")) ext = "usdz";
    else return badRequest("Only .glb and .usdz models are accepted");
  }
  const contentType = ext === "glb" ? "model/gltf-binary" : "model/vnd.usdz";
  const key = `models/${crypto.randomUUID()}.${ext}`;
  try {
    await context.env.IMAGES.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType },
    });
  } catch (err) {
    console.error(err);
    return serverError("Could not store model");
  }
  const url = new URL(context.request.url);
  return json({ key, url: `${url.origin}/api/images/${key}` }, { status: 201 });
};
