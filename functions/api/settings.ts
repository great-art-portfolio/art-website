import { getSetting, setSetting } from "../_lib/db";
import type { AppEnv } from "../_lib/env";
import { badRequest, json, requireAdmin, serverError } from "../_lib/http";

/**
 * The one-line announcement banner on the homepage
 * ("Find me at the Lilac Festival this Sunday!").
 * She edits it from /admin; visitors just read it.
 */
export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  try {
    return json({ announcement: await getSetting(context.env, "announcement") });
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
  const announcement =
    typeof body["announcement"] === "string" ? body["announcement"].trim().slice(0, 280) : "";
  try {
    await setSetting(context.env, "announcement", announcement);
    return json({ announcement });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
