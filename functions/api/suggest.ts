import type { AppEnv } from "../_lib/env";
import { badRequest, json, notEnabled, requireAdmin } from "../_lib/http";
import {
  parseSuggestInput,
  suggestEnabled,
  suggestWords,
} from "../_lib/suggest";

/** Admin: whether the title and description helper is set up, so the
 * studio only shows its button when it can work. */
export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const denied = requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  return json({ enabled: suggestEnabled(context.env) });
};

/** Admin: title, description, and alt text ideas from the painting's photo.
 * Body: { image: data URL, title, medium, widthIn, heightIn, notes }. */
export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const denied = requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  if (!suggestEnabled(context.env))
    return notEnabled("The writing helper", "Set the MUSE_API_KEY secret.");
  let raw: unknown;
  try {
    raw = (await context.request.json()) as unknown;
  } catch {
    return badRequest("Invalid JSON");
  }
  const input = parseSuggestInput(raw);
  if (input === null) return badRequest("Add a photo first");
  try {
    return json(await suggestWords(context.env, input));
  } catch (err) {
    console.error(err);
    return json(
      { error: "The writing helper couldn't answer — try again in a minute." },
      { status: 502 },
    );
  }
};
