import type { AppEnv } from "../_lib/env";
import { badRequest, json, requireAdmin, serverError } from "../_lib/http";
import {
  addCollectorEmail,
  listCollectorEmails,
  parseCollectorEmail,
} from "../_lib/collectors";
import { turnstileOk } from "../_lib/turnstile";

/**
 * Collector email list ("tell me about new paintings" addresses).
 *
 * POST is public on purpose — subscribing only writes one row, and the
 * address is validated twice (shape here, inbox on first broadcast).
 * GET (the count for /admin) stays behind the admin check.
 */
export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Invalid JSON");
  }
  if (
    !(await turnstileOk(
      context.env,
      body["turnstileToken"],
      context.request.headers.get("cf-connecting-ip"),
    ))
  ) {
    return badRequest("Spam check failed — please try again.");
  }
  const email = parseCollectorEmail(body["email"]);
  if (email === null) return badRequest("A valid email address is required");
  try {
    await addCollectorEmail(context.env, email);
    return json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};

/** Admin: how many addresses are on the email list. */
export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const denied = requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  try {
    return json({ total: (await listCollectorEmails(context.env)).length });
  } catch (err) {
    console.error(err);
    return serverError();
  }
};
