/** Print-ready QR codes for gallery labels: each painting's buyer page
 * as a build-time SVG (no client script, prints crisp at any size).
 * Pure node-safe module — the page bakes the SVG into static HTML. */
import QRCode from "qrcode";
import { SITE_URL } from "./site";

/** Absolute buyer URL behind a painting's code (never localhost). */
export function paintingPageUrl(slug: string): string {
  return `${SITE_URL}/paintings/${slug}`;
}

/** QR code SVG for any URL. Black on white, quiet zone included. */
export async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    margin: 2,
    width: 240,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
