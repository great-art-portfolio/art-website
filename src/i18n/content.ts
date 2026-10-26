/** Translated painting and banner words for the build. Astro-only (it
 * globs the content folder). A translation is used only while it matches
 * the current English: after an edit the page shows her English until the
 * studio has translated the new words. */
import type { Locale } from "./locales";
import {
  BANNER_TRANSLATIONS,
  parseTranslationFile,
  sourceHash,
  translationPath,
  type PaintingWords,
  type TranslationFile,
} from "./painting-text";

const files = import.meta.glob<unknown>("../content/translations/*.json", {
  eager: true,
  import: "default",
});

function fileFor(repoPath: string): TranslationFile | null {
  const key = repoPath.replace(/^src\/content\//, "../content/");
  return key in files ? parseTranslationFile(files[key]) : null;
}

/** The words a page shows in `locale`, and whether they're translated. */
export function wordsIn(
  locale: Locale,
  repoPath: string,
  english: PaintingWords,
): PaintingWords & { translated: boolean } {
  if (locale === "en") return { ...english, translated: false };
  const file = fileFor(repoPath);
  const words = file?.langs[locale];
  if (
    file === null ||
    words === undefined ||
    file.source !== sourceHash(english)
  )
    return { ...english, translated: false };
  return { ...words, translated: true };
}

/** A painting's words in `locale`, from its .md path. */
export function paintingWordsIn(
  locale: Locale,
  mdPath: string,
  english: PaintingWords,
): PaintingWords & { translated: boolean } {
  return wordsIn(locale, translationPath(mdPath), english);
}

/** The homepage note in `locale`. */
export function bannerIn(locale: Locale, text: string): string {
  if (text === "") return "";
  return wordsIn(locale, BANNER_TRANSLATIONS, {
    title: text,
    description: "",
    alt: "",
    medium: "",
  }).title;
}

/** Every translation file the build can see, by repo path, for the
 * studio's catch-up list. */
export function allTranslationFiles(): Map<string, TranslationFile> {
  const out = new Map<string, TranslationFile>();
  for (const [key, raw] of Object.entries(files))
    out.set(
      key.replace(/^\.\.\/content\//, "src/content/"),
      parseTranslationFile(raw),
    );
  return out;
}
