/** The studio's side of the translated site: when she saves a painting or
 * the banner, her words go to the translator and come back as the
 * translation file committed alongside. Only what changed is translated:
 * unchanged words in a language already done are left alone. A failed
 * translation never blocks a save; the dashboard catches up later. */
import languages from "../content/languages.json";
import { api } from "./api";
import { cleanLocales, type OtherLocale } from "../i18n/locales";
import {
  BANNER_TRANSLATIONS,
  formatTranslationFile,
  missingLocales,
  parseTranslationFile,
  sourceHash,
  translationPath,
  type PaintingWords,
} from "../i18n/painting-text";

/** The languages switched on as of this build. */
export const SITE_LANGUAGES: OtherLocale[] = cleanLocales(languages.languages);

/** "into 12 languages" for status lines. */
export function languagesLabel(n: number): string {
  return n === 1 ? "into 1 language" : `into ${n} languages`;
}

/** The translation file to commit with these words, or null when nothing
 * needs doing (or the translator is unavailable). `path` is the painting's
 * .md, or the banner's translation file. */
export async function translationFor(
  kind: "painting" | "banner",
  path: string,
  english: PaintingWords,
  wanted: readonly OtherLocale[] = SITE_LANGUAGES,
): Promise<{ path: string; blob: string } | null> {
  if (wanted.length === 0 || english.title.trim() === "") return null;
  const file = kind === "banner" ? BANNER_TRANSLATIONS : translationPath(path);
  const raw = await api.getPaintingFile(file);
  let existing = parseTranslationFile(null);
  try {
    existing = parseTranslationFile(raw === null ? null : JSON.parse(raw));
  } catch {
    // An unreadable file is rewritten from scratch.
  }
  const missing = missingLocales(existing, english, wanted);
  if (missing.length === 0) return null;
  let got: Partial<Record<OtherLocale, PaintingWords>>;
  try {
    got = await api.translate({ kind, words: english, locales: missing });
  } catch {
    return null;
  }
  const source = sourceHash(english);
  // Changed English starts over; otherwise the new languages join the old.
  const keep = existing.source === source ? existing.langs : {};
  return {
    path: file,
    blob: formatTranslationFile({ source, langs: { ...keep, ...got } }),
  };
}
