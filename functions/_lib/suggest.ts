import type { AppEnv } from "./env";

/** Title and description ideas for a new painting, from its photo. The
 * studio sends a small JPEG and what she has typed so far; Muse Spark on
 * the Meta Model API (OpenAI-compatible chat completions, with image
 * input) looks at the photo and answers in JSON. She picks or ignores
 * the ideas, so nothing it writes goes live on its own. */
export const MUSE_URL = "https://api.meta.ai/v1/chat/completions";
export const MUSE_MODEL = "muse-spark-1.3-contributor";
const TIMEOUT_MS = 45_000;
/** A 1024px JPEG is ~150 KB, ~200 KB as base64. Twice that is plenty. */
export const MAX_IMAGE_CHARS = 700_000;

export interface SuggestInput {
  /** data:image/jpeg|png|webp;base64,… */
  image: string;
  title: string;
  medium: string;
  widthIn: number | null;
  heightIn: number | null;
  /** Her own words about the painting: place, season, what moved her. */
  notes: string;
}

export interface Suggestion {
  titles: string[];
  description: string;
  alt: string;
}

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const inches = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1000 ? v : null;

/** Validates the request body. Null when it isn't usable. */
export function parseSuggestInput(raw: unknown): SuggestInput | null {
  if (typeof raw !== "object" || raw === null) return null;
  const body = raw as Record<string, unknown>;
  const image = typeof body["image"] === "string" ? body["image"] : "";
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image))
    return null;
  if (image.length > MAX_IMAGE_CHARS) return null;
  return {
    image,
    title: str(body["title"], 120),
    medium: str(body["medium"], 120),
    widthIn: inches(body["widthIn"]),
    heightIn: inches(body["heightIn"]),
    notes: str(body["notes"], 500),
  };
}

/** Her own words, so ideas come out in her voice: descriptions she
 * wrote (newest first) and every title already in the gallery. */
export interface Voice {
  examples: Array<{ title: string; description: string }>;
  taken: string[];
}

export const NO_VOICE: Voice = { examples: [], taken: [] };

/** Used until the gallery has descriptions of its own. */
const FALLBACK_EXAMPLE = {
  title: "Prairie Moon",
  description:
    "A pale moon hangs over stacked bands of white cliff, black rock, and rust-red earth — the prairies reduced to their shapes and colours. Warm, grounded, and quietly dramatic.",
};

export function systemPrompt(voice: Voice): string {
  const examples =
    voice.examples.length > 0 ? voice.examples : [FALLBACK_EXAMPLE];
  return [
    "You help Barbara Straka, a painter in Calgary, Alberta, name and describe her original paintings for the shop on her website.",
    "She paints nature and abstraction: prairie light, quiet water, and colour studies between landscape and feeling.",
    "Look closely at the photo: the colours, the shapes and how they move, the marks and texture. Then say what it brings to mind, the way she would.",
    "Her descriptions follow one pattern: a sentence on what you see (colours and shapes, concretely), a short line on the feeling, and often a closing line about the painting in a room or on a wall. Plain, warm, specific words. Canadian spelling.",
    "Her titles are one to three words: a place, a season, water, weather, or another natural thing. Never clever or abstract-sounding.",
    ...(voice.taken.length > 0
      ? [
          `Titles already in her gallery, so don't reuse or echo them: ${voice.taken.join(", ")}.`,
        ]
      : []),
    "No hype or clichés (stunning, masterpiece, captivating, evocative, vibrant, tapestry, symphony), no emoji, no hashtags, no exclamation marks.",
    "Don't invent facts you can't see, like place names or materials, unless her notes give them. Don't mention the price or the artist's name.",
    "Descriptions she wrote, for her voice:",
    ...examples.map((e) => `“${e.title}”: ${e.description}`),
    'Reply with JSON only, no other text: {"titles": [three different short titles, one to three words each, no quotation marks], "description": "two or three sentences, under 60 words", "alt": "one literal sentence under 140 characters describing the image for someone who can\'t see it"}',
  ].join("\n");
}

/** Her gallery as the build knows it, from /catalog.json: the newest
 * eight descriptions and every title. */
export function voiceFrom(
  catalog: Array<{ title: string; description: string; added: string }>,
): Voice {
  const examples = catalog
    .filter((p) => p.description.trim() !== "")
    .sort((a, b) => b.added.localeCompare(a.added))
    .slice(0, 8)
    .map((p) => ({
      title: p.title,
      description: p.description.replace(/\s+/g, " ").trim().slice(0, 400),
    }));
  return { examples, taken: catalog.map((p) => p.title).slice(0, 80) };
}

/** The prompt with no gallery to learn from. */
export const SYSTEM_PROMPT = systemPrompt(NO_VOICE);

/** The user turn: what she already knows, then the photo. */
export function userContent(input: SuggestInput): unknown[] {
  const facts = [
    input.title !== "" ? `Working title: ${input.title}` : "",
    input.medium !== "" ? `Medium: ${input.medium}` : "",
    input.widthIn !== null && input.heightIn !== null
      ? `Size: ${input.widthIn} × ${input.heightIn} in`
      : "",
    input.notes !== "" ? `Her notes: ${input.notes}` : "",
  ].filter((line) => line !== "");
  return [
    {
      type: "text",
      text:
        facts.length > 0
          ? `Suggest titles and a description for this painting.\n${facts.join("\n")}`
          : "Suggest titles and a description for this painting.",
    },
    { type: "image_url", image_url: { url: input.image } },
  ];
}

/** Reads the model's JSON, tolerating a code fence or stray words around
 * it. Null when it has no usable title or description. */
export function parseSuggestion(text: string): Suggestion | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const titles = (Array.isArray(obj["titles"]) ? obj["titles"] : [])
    .map((t) => str(t, 120).replace(/^["“'‘]+|["”'’.]+$/g, ""))
    .filter((t, i, all) => t !== "" && all.indexOf(t) === i)
    .slice(0, 3);
  const description = str(obj["description"], 2000);
  if (titles.length === 0 || description === "") return null;
  return { titles, description, alt: str(obj["alt"], 200) };
}

export function suggestEnabled(env: AppEnv): boolean {
  return (env.MUSE_API_KEY ?? "") !== "";
}

/** Asks Muse for ideas. Throws on a failed or unreadable answer. */
export async function suggestWords(
  env: AppEnv,
  input: SuggestInput,
  voice: Voice = NO_VOICE,
): Promise<Suggestion> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(MUSE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.MUSE_API_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.MUSE_MODEL ?? MUSE_MODEL,
        reasoning_effort: "low",
        messages: [
          { role: "system", content: systemPrompt(voice) },
          { role: "user", content: userContent(input) },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Muse answered ${res.status}`);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    const suggestion =
      typeof content === "string" ? parseSuggestion(content) : null;
    if (suggestion === null) throw new Error("Muse sent no usable ideas");
    return suggestion;
  } finally {
    clearTimeout(timer);
  }
}
