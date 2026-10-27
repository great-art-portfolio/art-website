import type { AppEnv } from "./env";
import { logEvent } from "./log";
import { MUSE_MODEL, MUSE_URL } from "./suggest";
import {
  cleanLocales,
  localeInfo,
  type OtherLocale,
} from "../../src/i18n/locales";
import type { PaintingWords } from "../../src/i18n/painting-text";

/** Her words in the other languages of the site: a painting's title,
 * description, alt text and medium, or the homepage note. Muse Spark
 * translates; the studio calls this when she saves, and nothing it writes
 * replaces her English. Languages go four to a request, in parallel, so a
 * dozen take about as long as four, and one that fails doesn't sink the
 * rest. */

const TIMEOUT_MS = 50_000;
const PER_REQUEST = 4;

export interface TranslateInput {
  kind: "painting" | "banner";
  words: PaintingWords;
  locales: OtherLocale[];
}

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

export function parseTranslateInput(raw: unknown): TranslateInput | null {
  if (typeof raw !== "object" || raw === null) return null;
  const body = raw as Record<string, unknown>;
  const kind = body["kind"] === "banner" ? "banner" : "painting";
  const w =
    typeof body["words"] === "object" && body["words"] !== null
      ? (body["words"] as Record<string, unknown>)
      : {};
  const words = {
    title: str(w["title"], kind === "banner" ? 400 : 200),
    description: str(w["description"], 4000),
    alt: str(w["alt"], 400),
    medium: str(w["medium"], 200),
  };
  const locales = cleanLocales(body["locales"]);
  if (words.title === "" || locales.length === 0) return null;
  return { kind, words, locales };
}

export function systemPrompt(kind: "painting" | "banner"): string {
  return [
    "You translate the words of Barbara Straka, a painter in Calgary, Alberta, for the other-language versions of her shop website.",
    kind === "banner"
      ? "The text is a short note pinned to her homepage, like a handwritten card: keep it short, personal, and in her voice."
      : "You get a painting's title, its description, its alt text (a literal description of the photo for people who can't see it), and its medium (e.g. Acrylic on canvas).",
    "Translate the meaning and the feeling, not word for word. Use the plain, warm register she writes in. Keep her paragraph breaks. Add nothing, explain nothing, and leave out nothing.",
    "A title stays short and evocative, the way a painting title reads in that language. Keep names of places and people as they are (Bow River, Calgary, Banff). Use the usual term for the medium in that language. Dates and numbers stay as written.",
    "Write each language in its own script and its usual punctuation.",
    'Reply with JSON only, no other text: {"<code>": {"title": "…", "description": "…", "alt": "…", "medium": "…"}, …} with one entry for every language code asked for, and "" for any field that is empty in English.',
  ].join("\n");
}

export function userPrompt(
  input: TranslateInput,
  codes: OtherLocale[],
): string {
  const langs = codes.map((c) => `${c} (${localeInfo(c).english})`).join(", ");
  const w = input.words;
  return [
    `Translate into: ${langs}.`,
    "",
    `title: ${w.title}`,
    `description: ${w.description}`,
    `alt: ${w.alt}`,
    `medium: ${w.medium}`,
  ].join("\n");
}

/** Reads the model's JSON for the asked languages, tolerating a code
 * fence around it. A language with no title is left out. */
export function parseTranslation(
  text: string,
  codes: OtherLocale[],
  english: PaintingWords,
): Partial<Record<OtherLocale, PaintingWords>> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    return {};
  }
  if (typeof raw !== "object" || raw === null) return {};
  const all = raw as Record<string, unknown>;
  const out: Partial<Record<OtherLocale, PaintingWords>> = {};
  for (const code of codes) {
    const entry = all[code];
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const title = str(e["title"], 400);
    if (title === "") continue;
    // An empty English field stays empty, whatever came back.
    out[code] = {
      title,
      description:
        english.description === "" ? "" : str(e["description"], 4000),
      alt: english.alt === "" ? "" : str(e["alt"], 400),
      medium: english.medium === "" ? "" : str(e["medium"], 200),
    };
  }
  return out;
}

async function askMuse(
  env: AppEnv,
  input: TranslateInput,
  codes: OtherLocale[],
): Promise<Partial<Record<OtherLocale, PaintingWords>>> {
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
          { role: "system", content: systemPrompt(input.kind) },
          { role: "user", content: userPrompt(input, codes) },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Muse answered ${res.status}`);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    return typeof content === "string"
      ? parseTranslation(content, codes, input.words)
      : {};
  } finally {
    clearTimeout(timer);
  }
}

/** Translates into every asked language it can. Throws only when none
 * came back. */
export async function translateWords(
  env: AppEnv,
  input: TranslateInput,
): Promise<Partial<Record<OtherLocale, PaintingWords>>> {
  const groups: OtherLocale[][] = [];
  for (let i = 0; i < input.locales.length; i += PER_REQUEST)
    groups.push(input.locales.slice(i, i + PER_REQUEST));
  const results = await Promise.all(
    groups.map((codes) =>
      askMuse(env, input, codes).catch(async (err: unknown) => {
        await logEvent(env, {
          event: "translate.group_failed",
          message: "Translating into some languages failed",
          err,
          detail: { locales: codes.join(",") },
        });
        return {};
      }),
    ),
  );
  const out = Object.assign({}, ...results) as Partial<
    Record<OtherLocale, PaintingWords>
  >;
  if (Object.keys(out).length === 0)
    throw new Error("Muse sent no usable translations");
  return out;
}
