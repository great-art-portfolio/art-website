/**
 * Gallery file guards, shared by the commit + photo endpoints and their
 * tests. One leaf module with no imports, so node can load it directly.
 * Spaced names ("1 copy 2.md") pass — Finder duplicates are clumsy but
 * legitimate — while escapes and foreign folders never do.
 */

/** Single painting file reads (?path=…). */
export const PAINTING_FILE =
  /^src\/content\/paintings\/[A-Za-z0-9][A-Za-z0-9 _.-]*\.md$/;

/** Everything the admin endpoint may write or delete. */
export const GALLERY_PATH =
  /^(src\/content\/paintings\/[A-Za-z0-9][A-Za-z0-9 _.-]*|src\/content\/announcement\.txt|public\/models\/[A-Za-z0-9][A-Za-z0-9 _.-]*)$/;

/** Painting photo bytes for AR rebuilds. */
export const PHOTO_FILE =
  /^src\/content\/paintings\/[A-Za-z0-9][A-Za-z0-9 _.-]*\.(jpg|jpeg|png|webp|heic)$/i;
