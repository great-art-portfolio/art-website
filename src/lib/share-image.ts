/** The 1200px JPEG copy used for link previews, search results, and the
 * new-painting email. The original photo is near 1 MB, and WhatsApp drops
 * previews over about 300 KB. One setting, so the painting page and
 * /catalog.json name the same built file. */
export const SHARE_IMAGE = {
  width: 1200,
  format: "jpeg",
  quality: 72,
} as const;
