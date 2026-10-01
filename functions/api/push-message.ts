import type { AppEnv } from "../_lib/env";
import { json, serverError } from "../_lib/http";
import { readPushMessage } from "../_lib/push";

/** Public: the custom title and text for the next ping. Blank values mean
 * the standard title and note. Subscribers' service workers fetch it, and
 * it's shown in the notification anyway. */
export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  try {
    const copy = await readPushMessage(context.env);
    return json({ body: copy.body, title: copy.title });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
