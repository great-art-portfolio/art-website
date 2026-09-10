import type { AppEnv } from "./env";

export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

export function badRequest(message: string): Response {
  return json({ error: message }, { status: 400 });
}

export function serverError(message = "Something went wrong"): Response {
  return json({ error: message }, { status: 500 });
}

export function notEnabled(feature: string, hint: string): Response {
  return json(
    { error: `${feature} is disabled`, howToEnable: hint },
    { status: 501 },
  );
}

/** Admin check. Access is the prod gate; the token is defense in depth +
 * local dev. Unset token = allow. */
export function requireAdmin(request: Request, env: AppEnv): Response | null {
  const expected = env.ADMIN_API_TOKEN;
  if (expected === undefined || expected === "") return null;
  const header = request.headers.get("authorization");
  if (header === `Bearer ${expected}`) return null;
  return json({ error: "Unauthorized" }, { status: 401 });
}
