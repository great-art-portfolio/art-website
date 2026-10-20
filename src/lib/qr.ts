/** QR codes: printable gallery labels baked into static HTML at build time,
 * and the studio's small row icons drawn in the browser. One generator
 * serves both, so a row's icon is the same code its printed label carries. */
import qrcode from "qrcode-generator";
import { SITE_URL } from "./site";

/** Absolute production URL of a painting's buyer page. */
export function paintingPageUrl(slug: string): string {
  return `${SITE_URL}/paintings/${slug}`;
}

/** QR code SVG for a URL: black modules on a white square, with a quiet
 * zone of `margin` modules. Each run of dark modules in a row is one
 * rectangle, which keeps the markup small. CSS sizes it. */
export function qrSvg(url: string, margin = 2): string {
  const code = qrcode(0, "M");
  code.addData(url);
  code.make();
  const n = code.getModuleCount();
  const full = n + 2 * margin;
  let d = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n;) {
      if (!code.isDark(y, x)) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < n && code.isDark(y, x + run)) run++;
      d += `M${x + margin} ${y + margin}h${run}v1h-${run}z`;
      x += run;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}" ` +
    `width="240" height="240" shape-rendering="crispEdges">` +
    `<rect width="${full}" height="${full}" fill="#fff"/>` +
    `<path fill="#000" d="${d}"/></svg>`
  );
}
