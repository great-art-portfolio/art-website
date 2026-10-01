/**
 * Gallery path allowlists, shared by the commit and photo endpoints and
 * their tests. The module has no imports so node can load it directly.
 * Names with spaces ("1 copy 2.md") are allowed. Path escapes and other
 * folders are not.
 */

/** Single painting file reads (?path=). */
export const PAINTING_FILE =
  /^src\/content\/paintings\/[A-Za-z0-9][A-Za-z0-9 _.-]*\.md$/;

/** Paths the admin endpoint may write or delete. */
export const GALLERY_PATH =
  /^(src\/content\/paintings\/[A-Za-z0-9][A-Za-z0-9 _.-]*|src\/content\/announcement\.txt|public\/models\/[A-Za-z0-9][A-Za-z0-9 _.-]*)$/;

/** Painting photo bytes for AR rebuilds. */
export const PHOTO_FILE =
  /^src\/content\/paintings\/[A-Za-z0-9][A-Za-z0-9 _.-]*\.(jpg|jpeg|png|webp|heic)$/i;
