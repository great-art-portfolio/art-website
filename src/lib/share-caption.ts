import { SITE_URL } from "./site";

/** Social share caption for a painting room. It's rebuilt from the fields
 * until edited by hand. */

export interface ShareCaptionInput {
  /** Preview title ("Untitled" when the field is empty). */
  title: string;
  /** Preview price line ("$140.00 CAD"), or null without a price. */
  priceLabel: string | null;
  /** Preview meta line ("Oil on canvas · 24 × 36 in"), or "" when empty. */
  meta: string;
  /** Public slug, or "" when the page isn't live yet. */
  slug: string;
}

/** Two lines: what the painting is and where to see it. */
export function buildShareCaption(input: ShareCaptionInput): string {
  const title = input.title === "" ? "Untitled" : input.title;
  const head = [`New in the gallery: “${title}”`];
  if (input.meta !== "") head.push(input.meta);
  if (input.priceLabel !== null) head.push(input.priceLabel);
  const lines = [head.join(" — ")];
  if (input.slug !== "") lines.push(`${SITE_URL}/paintings/${input.slug}`);
  return lines.join("\n");
}
