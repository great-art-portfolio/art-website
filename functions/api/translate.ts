import type { AppEnv } from "../_lib/env";
import {
  badRequest,
  isLocalRequest,
  json,
  notEnabled,
  requireAdmin,
} from "../_lib/http";
import { suggestEnabled } from "../_lib/suggest";
import { parseTranslateInput, translateWords } from "../_lib/translate";

/** Admin: her words in other languages, for the site's translated pages.
 * Body: { kind: "painting" | "banner", words: { title, description, alt,
 * medium }, locales: ["fr", …] }. Answers { langs: { fr: {…}, … } } with
 * every language it managed; the studio retries the rest later. */
export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const denied = await requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  if (!suggestEnabled(context.env))
    return notEnabled("Translation", "Set the MUSE_API_KEY secret.");
  // Local copies (tests, review) never reach the translator unless asked
  // to: a practice save shouldn't spend real requests.
  if (isLocalRequest(context.request) && context.env.TRANSLATE_LOCAL !== "true")
    return notEnabled(
      "Translation on this machine",
      'Set TRANSLATE_LOCAL="true" in .dev.vars to try it locally.',
    );
  let raw: unknown;
  try {
    raw = (await context.request.json()) as unknown;
  } catch {
    return badRequest("Invalid JSON");
  }
  const input = parseTranslateInput(raw);
  if (input === null) return badRequest("Nothing to translate");
  try {
    return json({ langs: await translateWords(context.env, input) });
  } catch (err) {
    console.error(err);
    return json(
      { error: "Translation couldn't answer — it will try again later." },
      { status: 502 },
    );
  }
};
