/** Printable QR codes for gallery labels, linking each painting's buyer
 * page. Generated as SVG at build time and baked into static HTML. */
import QRCode from "qrcode";
import { SITE_URL } from "./site";

/** Absolute production URL of a painting's buyer page. */
export function paintingPageUrl(slug: string): string {
  return `${SITE_URL}/paintings/${slug}`;
}

/** QR code SVG for a URL, black on white with a quiet zone. */
export async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    margin: 2,
    width: 240,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
