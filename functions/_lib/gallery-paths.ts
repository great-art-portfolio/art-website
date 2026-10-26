/**
 * Gallery path allowlists, shared by the commit and photo endpoints and
 * their tests. The module has no imports so node can load it directly.
 * Names with spaces ("1 copy 2.md") are allowed. Path escapes and other
 * folders are not.
 */

/** Single painting file reads (?path=). */
export const PAINTING_FILE =
  /^src\/content\/paintings\/[A-Za-z0-9][A-Za-z0-9 _.-]*\.md$/;

/** A painting's (or the banner's) words in other languages. */
export const TRANSLATION_FILE =
  /^src\/content\/translations\/[A-Za-z0-9][A-Za-z0-9 _.-]*\.json$/;

/** The languages she has switched on. */
export const LANGUAGES_FILE = "src/content/languages.json";

/** Files the studio may read back (?path=). */
export function isReadableFile(path: string): boolean {
  return (
    PAINTING_FILE.test(path) ||
    TRANSLATION_FILE.test(path) ||
    path === LANGUAGES_FILE
  );
}

/** Paths the admin endpoint may write or delete. */
export const GALLERY_PATH =
  /^(src\/content\/paintings\/[A-Za-z0-9][A-Za-z0-9 _.-]*|src\/content\/announcement\.txt|src\/content\/languages\.json|src\/content\/translations\/[A-Za-z0-9][A-Za-z0-9 _.-]*\.json|public\/models\/[A-Za-z0-9][A-Za-z0-9 _.-]*)$/;

/** Painting photo bytes for AR rebuilds. */
export const PHOTO_FILE =
  /^src\/content\/paintings\/[A-Za-z0-9][A-Za-z0-9 _.-]*\.(jpg|jpeg|png|webp|heic)$/i;
