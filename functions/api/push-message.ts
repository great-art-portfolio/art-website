import type { AppEnv } from "../_lib/env";
import { json, serverError } from "../_lib/http";
import { readPushMessage } from "../_lib/push";

/** Public: the custom title + line the next ping shows. Empties mean
 * the service worker falls back to the standard title and note. Public
 * because subscribers' browsers fetch it — it becomes the notification
 * they see anyway. */
export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  try {
    const copy = await readPushMessage(context.env);
    return json({ body: copy.body, title: copy.title });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
