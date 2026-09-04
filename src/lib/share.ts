import { formatCAD } from "./money";
import { formatDimensions } from "./dims";

export interface ShareablePainting {
  title: string;
  priceCents: number;
  alt: string;
  description: string;
  pageUrl: string;
  widthIn?: number | null;
  heightIn?: number | null;
  depthIn?: number | null;
}

/** Caption for the "she just posted a new painting" button. */
export function buildCaption(painting: ShareablePainting): string {
  const size = formatDimensions(
    painting.widthIn ?? null,
    painting.heightIn ?? null,
    painting.depthIn ?? null,
  );
  const headline =
    size === ""
      ? `New painting: "${painting.title}" ${formatCAD(painting.priceCents)}`
      : `New painting: "${painting.title}" ${size} ${formatCAD(painting.priceCents)}`;
  const lines = [
    headline,
    "",
    painting.description === "" ? "Fresh from the Calgary studio." : painting.description,
    "",
    `See it here: ${painting.pageUrl}`,
    "",
    "#calgaryart #yycart #abstractart #canadianartist #originalpainting",
  ];
  return lines.join("\n");
}

/** Native iOS share sheet, with clipboard fallback for desktop. */
export async function sharePainting(input: {
  title: string;
  caption: string;
  pageUrl: string;
  imageBlob?: Blob | undefined;
}): Promise<"shared" | "copied" | "failed"> {
  const data: ShareData = { title: input.title, text: input.caption, url: input.pageUrl };
  if (input.imageBlob !== undefined) {
    try {
      const file = new File([input.imageBlob], "painting.jpg", { type: "image/jpeg" });
      const payload = { files: [file] };
      if (typeof navigator.canShare === "function" && navigator.canShare(payload)) {
        data.files = [file];
      }
    } catch {
      // File sharing unsupported — text share still works.
    }
  }
  try {
    if (navigator.share !== undefined) {
      await navigator.share(data);
      return "shared";
    }
  } catch (err) {
    // AbortError = she dismissed the sheet; not a failure.
    if (err instanceof DOMException && err.name === "AbortError") return "shared";
  }
  try {
    await navigator.clipboard.writeText(input.caption);
    return "copied";
  } catch {
    return "failed";
  }
}
