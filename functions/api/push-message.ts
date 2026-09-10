import type { AppEnv } from "../_lib/env";
import { json, serverError } from "../_lib/http";
import { readPushMessage } from "../_lib/push";

/** Public: the custom line the next ping shows. Empty means the service
 * worker falls back to the standard note. Public because subscribers'
 * browsers fetch it — it becomes the notification they see anyway. */
export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  try {
    return json({ body: await readPushMessage(context.env) });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
