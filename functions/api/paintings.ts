import { createPainting, listPaintings } from "../_lib/db";
import type { AppEnv } from "../_lib/env";
import { badRequest, json, requireAdmin, serverError } from "../_lib/http";

function dollarsToCents(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/** Optional dimension in inches: positive, sane wall-art range. */
function inches(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n > 240) return null;
  return Math.round(n * 10) / 10;
}

export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  try {
    return json({ paintings: await listPaintings(context.env) });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};

export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const denied = requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Invalid JSON");
  }
  const title = typeof body["title"] === "string" ? body["title"].trim() : "";
  const priceCents =
    typeof body["priceCents"] === "number" && Number.isInteger(body["priceCents"])
      ? (body["priceCents"] as number)
      : dollarsToCents(body["price"] ?? body["priceCents"]);
  if (title === "" || priceCents === null || priceCents <= 0) {
    return badRequest("Title and a positive price are required");
  }
  const alt = typeof body["alt"] === "string" ? body["alt"] : "";
  const description = typeof body["description"] === "string" ? body["description"] : "";
  const imageKey = typeof body["imageKey"] === "string" ? body["imageKey"] : "";
  const imageUrl = typeof body["imageUrl"] === "string" ? body["imageUrl"] : "";
  if (imageKey === "" && imageUrl === "") return badRequest("An image is required");
  try {
    const painting = await createPainting(context.env, {
      title,
      priceCents,
      alt,
      description,
      imageKey,
      imageUrl,
      widthIn: inches(body["widthIn"]),
      heightIn: inches(body["heightIn"]),
      depthIn: inches(body["depthIn"]),
      modelGlbUrl: typeof body["modelGlbUrl"] === "string" ? body["modelGlbUrl"] : "",
      modelUsdzUrl: typeof body["modelUsdzUrl"] === "string" ? body["modelUsdzUrl"] : "",
    });
    return json({ painting }, { status: 201 });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
