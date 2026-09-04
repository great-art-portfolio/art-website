import type { AppEnv } from "../../_lib/env";
import { json, serverError } from "../../_lib/http";

/** Public image serving from R2 with a long browser cache. */
export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const key = (context.params["key"] as string[]).join("/");
  if (key === "" || key.includes("..")) return json({ error: "Not found" }, { status: 404 });
  try {
    const object = await context.env.IMAGES.get(key);
    if (object === null) return json({ error: "Not found" }, { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "public, max-age=31536000, immutable");
    return new Response(object.body, { headers });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
