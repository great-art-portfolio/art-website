/** A painting's words in other languages, kept beside it in
 * src/content/translations/<file stem>.json:
 *
 *   { "source": "<hash of the English>", "fr": { "title", "description", "alt" }, … }
 *
 * The studio writes the file when she saves, and again whenever the
 * English changes (the hash no longer matches) or she switches a language
 * on. No imports beyond the locale list, so the studio, node, and Pages
 * Functions can all use it. */
import { cleanLocales, type OtherLocale } from "./locales";

export interface PaintingWords {
  title: string;
  description: string;
  alt: string;
  /** "Acrylic on canvas"; "" when she left it blank. */
  medium: string;
}

export interface TranslationFile {
  source: string;
  langs: Partial<Record<OtherLocale, PaintingWords>>;
}

/** FNV-1a over the English words: changes whenever any of them do. */
export function sourceHash(words: PaintingWords): string {
  let hash = 0x811c9dc5;
  const text = [words.title, words.description.trim(), words.alt, words.medium];
  for (const ch of text.join("\u0000")) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

function words(raw: unknown): PaintingWords | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const title = str(r["title"], 200);
  if (title === "") return null;
  return {
    title,
    description: str(r["description"], 4000),
    alt: str(r["alt"], 400),
    medium: str(r["medium"], 200),
  };
}

/** Reads a translation file; unknown languages and bad entries are
 * dropped. */
export function parseTranslationFile(raw: unknown): TranslationFile {
  const out: TranslationFile = { source: "", langs: {} };
  if (typeof raw !== "object" || raw === null) return out;
  const r = raw as Record<string, unknown>;
  out.source = typeof r["source"] === "string" ? r["source"] : "";
  for (const code of cleanLocales(Object.keys(r))) {
    const w = words(r[code]);
    if (w !== null) out.langs[code] = w;
  }
  return out;
}

/** The file's JSON text, languages in the site's order. */
export function formatTranslationFile(file: TranslationFile): string {
  const body: Record<string, unknown> = { source: file.source };
  for (const code of cleanLocales(Object.keys(file.langs)))
    body[code] = file.langs[code];
  return `${JSON.stringify(body, null, 2)}\n`;
}

/** The languages still to translate: all of `wanted` when the English
 * changed, else only those missing. */
export function missingLocales(
  file: TranslationFile,
  english: PaintingWords,
  wanted: readonly OtherLocale[],
): OtherLocale[] {
  if (file.source !== sourceHash(english)) return [...wanted];
  return wanted.filter((code) => file.langs[code] === undefined);
}

/** "src/content/paintings/IMG_5667.md" → its translation file. */
export function translationPath(mdPath: string): string {
  const stem = (mdPath.split("/").pop() ?? "").replace(/\.md$/i, "");
  return `src/content/translations/${stem}.json`;
}

/** The banner's translations live in one file too, with `title` holding
 * the note's text. */
export const BANNER_TRANSLATIONS = "src/content/translations/announcement.json";
