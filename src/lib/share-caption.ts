import { SITE_URL } from "./site";

/** "Tell social media" words for a painting room: prefilled, editable,
 * rebuilt live from the fields until she types her own. */

export interface ShareCaptionInput {
  /** Preview title ("Untitled" when the field is empty). */
  title: string;
  /** Preview price line ("$140.00 CAD"), or null while priceless. */
  priceLabel: string | null;
  /** Preview meta line ("Oil on canvas · 24 × 36 in", "" when bare). */
  meta: string;
  /** Public slug ("" when the page has no live address yet). */
  slug: string;
}

/** Two lines, plain words: what it is, where to see it. */
export function buildShareCaption(input: ShareCaptionInput): string {
  const title = input.title === "" ? "Untitled" : input.title;
  const head = [`New in the gallery: “${title}”`];
  if (input.meta !== "") head.push(input.meta);
  if (input.priceLabel !== null) head.push(input.priceLabel);
  const lines = [head.join(" — ")];
  if (input.slug !== "") lines.push(`${SITE_URL}/paintings/${input.slug}`);
  return lines.join("\n");
}
