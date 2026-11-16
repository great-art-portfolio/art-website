import type { AppEnv } from "./env";

/** DeepSeek (OpenAI-style chat completions, with image input) behind the
 * studio's writing helper and translations. The address and the model
 * live here only, so a later swap is one change. Both are quick tasks, so
 * thinking is off and no tools are sent. Its key is the Pages secret
 * DEEPSEEK_API_KEY; DeepSeek is prepaid, so an empty balance answers 402. */
export const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
export const DEEPSEEK_MODEL = "deepseek-flash";

export function deepseekEnabled(env: AppEnv): boolean {
  return (env.DEEPSEEK_API_KEY ?? "") !== "";
}

/** What went wrong, in words an agent reading the logs can act on. */
export function deepseekProblem(status: number): string {
  switch (status) {
    case 401:
      return "DeepSeek rejected the key (401): check the DEEPSEEK_API_KEY secret";
    case 402:
      return "DeepSeek's balance is used up (402): top up at platform.deepseek.com";
    case 429:
      return "DeepSeek is rate-limiting (429): too many requests at once";
    default:
      return `DeepSeek answered ${status}`;
  }
}

/** A failed answer from DeepSeek, with its HTTP status. */
export class DeepSeekError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(deepseekProblem(status));
    this.name = "DeepSeekError";
    this.status = status;
  }
}

/** One quick request. Answers the reply's text, or null when it had none;
 * throws DeepSeekError on a failed answer, an AbortError on a timeout. */
export async function askDeepSeek(
  env: AppEnv,
  messages: Array<{ role: "system" | "user"; content: unknown }>,
  timeoutMs: number,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.DEEPSEEK_MODEL ?? DEEPSEEK_MODEL,
        thinking: { type: "disabled" },
        messages,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new DeepSeekError(res.status);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    return typeof content === "string" ? content : null;
  } finally {
    clearTimeout(timer);
  }
}
