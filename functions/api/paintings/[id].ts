import { deletePainting, getPainting, updatePainting, type PaintingRow } from "../../_lib/db";
import type { AppEnv } from "../../_lib/env";
import { badRequest, json, requireAdmin, serverError } from "../../_lib/http";

const STATUSES = new Set(["draft", "available", "reserved", "sold"]);

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  try {
    const painting = await getPainting(context.env, context.params["id"] as string);
    if (painting === null || painting.status === "draft") {
      return json({ error: "Not found" }, { status: 404 });
    }
    return json({ painting });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};

export const onRequestPatch: PagesFunction<AppEnv> = async (context) => {
  const denied = requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Invalid JSON");
  }
  const patch: Partial<PaintingRow> = {};
  if (typeof body["title"] === "string" && body["title"].trim() !== "") patch.title = body["title"].trim();
  if (typeof body["priceCents"] === "number" && body["priceCents"] > 0) patch.price_cents = Math.round(body["priceCents"]);
  if (typeof body["alt"] === "string") patch.alt = body["alt"];
  if (typeof body["description"] === "string") patch.description = body["description"];
  if (typeof body["imageKey"] === "string") patch.image_key = body["imageKey"];
  if (typeof body["imageUrl"] === "string") patch.image_url = body["imageUrl"];
  if (typeof body["modelGlbUrl"] === "string") patch.model_glb_url = body["modelGlbUrl"];
  if (typeof body["modelUsdzUrl"] === "string") patch.model_usdz_url = body["modelUsdzUrl"];
  for (const key of ["width_in", "height_in", "depth_in"] as const) {
    const raw = body[key === "width_in" ? "widthIn" : key === "height_in" ? "heightIn" : "depthIn"];
    if (raw === undefined || raw === null || raw === "") continue;
    const n = typeof raw === "string" ? Number(raw) : (raw as number);
    if (typeof n === "number" && Number.isFinite(n) && n > 0 && n <= 240) {
      patch[key] = Math.round(n * 10) / 10;
    }
  }
  if (typeof body["status"] === "string" && STATUSES.has(body["status"])) {
    patch.status = body["status"] as PaintingRow["status"];
  }
  try {
    const painting = await updatePainting(context.env, context.params["id"] as string, patch);
    if (painting === null) return json({ error: "Not found" }, { status: 404 });
    return json({ painting });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};

export const onRequestDelete: PagesFunction<AppEnv> = async (context) => {
  const denied = requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  try {
    await deletePainting(context.env, context.params["id"] as string);
    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
