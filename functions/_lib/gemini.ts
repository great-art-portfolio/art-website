import type { AppEnv } from "./env";

/** Google's Gemini API behind the studio's writing helper: Gemini 4
 * Hydrogen reads paintings better than DeepSeek (owner, 2026-11-16).
 * One generateContent call with the photo inline, low thinking (it can't
 * be turned off on Gemini 4), and JSON out through a response schema.
 * The address and the model live here only. Its key is the Pages secret
 * GEMINI_API_KEY, a free-tier AI Studio key with no billing (her
 * paintings are public): past the free limit Google answers 429, and
 * nothing falls back to another model. Translations stay on DeepSeek. */
export const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";
export const GEMINI_MODEL = "gemini-4-hydrogen";

export function geminiEnabled(env: AppEnv): boolean {
  return (env.GEMINI_API_KEY ?? "") !== "";
}

/** What went wrong, in words an agent reading the logs can act on.
 * `reason` is Google's ErrorInfo reason (API_KEY_INVALID, …) when sent. */
export function geminiProblem(status: number, reason = ""): string {
  if (reason === "API_KEY_INVALID" || status === 401)
    return `Google rejected the key (${status}): check the GEMINI_API_KEY secret (keys key add gemini on z)`;
  switch (status) {
    case 403:
      return "Google refused the key (403): it may be restricted, blocked or leaked; make a new one at aistudio.google.com/apikey";
    case 429:
      return "Google's free limit is used up (429): requests per minute or per day; the daily one resets at midnight Pacific";
    default:
      return `Gemini answered ${status}${reason !== "" ? ` (${reason})` : ""}`;
  }
}

/** A failed answer from Gemini, with its HTTP status and Google's reason. */
export class GeminiError extends Error {
  readonly status: number;
  readonly reason: string;
  constructor(status: number, reason = "") {
    super(geminiProblem(status, reason));
    this.name = "GeminiError";
    this.status = status;
    this.reason = reason;
  }
}

/** Google's ErrorInfo reason from an error body, or "". */
function errorReason(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  const details = (body as { error?: { details?: unknown } }).error?.details;
  if (!Array.isArray(details)) return "";
  for (const d of details) {
    const reason = (d as { reason?: unknown } | null)?.reason;
    if (typeof reason === "string") return reason;
  }
  return "";
}

/** One request: a system instruction, the user's parts (text and inline
 * images), and the JSON schema the answer must follow. Answers the
 * reply's text (thoughts left out), or null when it had none; throws
 * GeminiError on a failed answer, an AbortError on a timeout. */
export async function askGemini(
  env: AppEnv,
  request: { system: string; parts: unknown[]; schema: unknown },
  timeoutMs: number,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `${GEMINI_API}/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": env.GEMINI_API_KEY ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: [{ role: "user", parts: request.parts }],
          generationConfig: {
            thinkingConfig: { thinkingLevel: "low" },
            responseFormat: {
              text: { mimeType: "APPLICATION_JSON", schema: request.schema },
            },
          },
        }),
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as unknown;
      throw new GeminiError(res.status, errorReason(body));
    }
    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: unknown; thought?: unknown }> };
      }>;
    };
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .flatMap((p) =>
        p.thought !== true && typeof p.text === "string" ? [p.text] : [],
      )
      .join("");
    return text === "" ? null : text;
  } finally {
    clearTimeout(timer);
  }
}
