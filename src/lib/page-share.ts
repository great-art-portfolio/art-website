import { formatPriceCAD } from "./money";

/** Buyer page sharing. Uses the share sheet where available and copies the
 * link otherwise. Dismissing the sheet isn't treated as an error. */

export type PageShareResult = "shared" | "dismissed" | "copied" | "failed";

export interface PageShareInput {
  title: string;
  priceCents: number;
  url: string;
}

/** "“First Thaw” — $125 CAD", or just the title without a price. */
export function shareText(title: string, priceCents: number): string {
  const name = title === "" ? "this painting" : `“${title}”`;
  return priceCents > 0 ? `${name} — ${formatPriceCAD(priceCents)}` : name;
}

export async function sharePaintingPage(
  input: PageShareInput,
): Promise<PageShareResult> {
  if (typeof navigator === "undefined") return "failed";
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: input.title === "" ? "Original painting" : `“${input.title}”`,
        text: shareText(input.title, input.priceCents),
        url: input.url,
      });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "dismissed";
      }
      return "failed";
    }
  }
  try {
    await navigator.clipboard.writeText(input.url);
    return "copied";
  } catch {
    return "failed";
  }
}
