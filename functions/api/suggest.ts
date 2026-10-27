import type { AppEnv } from "../_lib/env";
import { badRequest, json, notEnabled, requireAdmin } from "../_lib/http";
import {
  NO_VOICE,
  parseSuggestInput,
  suggestEnabled,
  suggestWords,
  voiceFrom,
  type Voice,
} from "../_lib/suggest";
import { parseCatalog } from "../_lib/validation";
import { logEvent } from "../_lib/log";

/** Her gallery's titles and descriptions, so ideas sound like her. None
 * when the catalog can't be read (the dev studio has no build). */
async function galleryVoice(env: AppEnv, request: Request): Promise<Voice> {
  try {
    const origin = new URL(request.url).origin;
    const res = await env.ASSETS.fetch(new Request(`${origin}/catalog.json`));
    return res.ok ? voiceFrom(parseCatalog(await res.json())) : NO_VOICE;
  } catch {
    return NO_VOICE;
  }
}

/** Admin: whether the title and description helper is set up, so the
 * studio only shows its button when it can work. */
export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const denied = await requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  return json({ enabled: suggestEnabled(context.env) });
};

/** Admin: title, description, and alt text ideas from the painting's photo.
 * Body: { image: data URL, title, medium, widthIn, heightIn, notes }. */
export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const denied = await requireAdmin(context.request, context.env);
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
    const voice = await galleryVoice(context.env, context.request);
    return json(await suggestWords(context.env, input, voice));
  } catch (err) {
    await logEvent(context.env, {
      event: "suggest.threw",
      message: "The writing helper failed",
      err,
      request: context.request,
    });
    return json(
      { error: "The writing helper couldn't answer — try again in a minute." },
      { status: 502 },
    );
  }
};
