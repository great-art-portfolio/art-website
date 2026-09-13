import { formatCAD } from "./money";

/** Buyer "Share this painting": the phone's sheet carries the page link;
 * everywhere else the link rides the clipboard. Dismissing the sheet is
 * silence, never an error. */

export type PageShareResult = "shared" | "dismissed" | "copied" | "failed";

export interface PageShareInput {
  title: string;
  priceCents: number;
  url: string;
}

/** "“First Thaw” — $125.00 CAD" (bare name while priceless). */
export function shareText(title: string, priceCents: number): string {
  const name = title === "" ? "this painting" : `“${title}”`;
  return priceCents > 0 ? `${name} — ${formatCAD(priceCents)} CAD` : name;
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
