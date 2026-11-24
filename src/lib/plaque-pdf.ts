/**
 * Client-side 5x7 in (300 DPI) PDF builder for the studio artist plaque.
 * Keeps the downloaded PDF in sync with the optional Instagram handle.
 */
import { normalizeInstagramHandle } from "./instagram";

const PAPER = "#faf7f1";
const WASH_TOP = "#f1e7d4";
const CARD = "#fffdf8";
const INK = "#23201b";
const MUTED = "#756a5c";
const LINE = "#e5dccb";
const QR_BORDER = "#ddd2bd";
const ACCENT = "#a44a24";
const SANS = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const SERIF = '"Fraunces Variable", Georgia, serif';

/** Wrap a raw baseline JPEG byte stream in a single-page PDF 1.4 wrapper. */
export function buildJpegPdf(
  jpeg: Uint8Array,
  imgWidth: number,
  imgHeight: number,
  pageWidthPt = 360,
  pageHeightPt = 504,
): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const header = enc.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const contentStream = `q\n${pageWidthPt} 0 0 ${pageHeightPt} 0 0 cm\n/Im0 Do\nQ\n`;
  const contentBytes = enc.encode(contentStream);

  const obj1 = enc.encode(
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
  );
  const obj2 = enc.encode(
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
  );
  const obj3 = enc.encode(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidthPt} ${pageHeightPt}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
  );
  const obj4Head = enc.encode(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgWidth} /Height ${imgHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  const obj4Tail = enc.encode("\nendstream\nendobj\n");
  const obj5 = enc.encode(
    `5 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n${contentStream}endstream\nendobj\n`,
  );

  const off1 = header.length;
  const off2 = off1 + obj1.length;
  const off3 = off2 + obj2.length;
  const off4 = off3 + obj3.length;
  const off5 = off4 + obj4Head.length + jpeg.length + obj4Tail.length;
  const xrefOffset = off5 + obj5.length;

  const fmt = (n: number): string =>
    `${String(n).padStart(10, "0")} 00000 n \n`;
  const xref = enc.encode(
    "xref\n0 6\n" +
      "0000000000 65535 f \n" +
      fmt(off1) +
      fmt(off2) +
      fmt(off3) +
      fmt(off4) +
      fmt(off5) +
      `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  const total = xrefOffset + xref.length;
  const out = new Uint8Array(new ArrayBuffer(total));
  let pos = 0;
  for (const part of [
    header,
    obj1,
    obj2,
    obj3,
    obj4Head,
    jpeg,
    obj4Tail,
    obj5,
    xref,
  ]) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}

function traceRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawTrackedUpper(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  tracking: number,
): void {
  const chars = Array.from(text);
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const totalWidth =
    widths.reduce((a, b) => a + b, 0) +
    Math.max(0, chars.length - 1) * tracking;
  let x = cx - totalWidth / 2;
  ctx.textAlign = "left";
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i] ?? "", x, y);
    x += (widths[i] ?? 0) + tracking;
  }
  ctx.textAlign = "center";
}

function loadSvgImage(svgEl: SVGElement): Promise<HTMLImageElement> {
  const clone = svgEl.cloneNode(true);
  if (!(clone instanceof SVGElement)) {
    return Promise.reject(new Error("Expected SVG element"));
  }
  clone.setAttribute("width", "680");
  clone.setAttribute("height", "99");
  const xml = new XMLSerializer()
    .serializeToString(clone)
    .replaceAll("currentColor", INK);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  return new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load plaque signature"));
  });
}

export interface RenderPlaqueOptions {
  svgEl: SVGElement;
  qrImg: HTMLImageElement;
  instagram: string;
}

/** Render the 5x7 in (1500x2100 px) artist plaque as a print-ready PDF. */
export async function renderPlaquePdf({
  svgEl,
  qrImg,
  instagram,
}: RenderPlaqueOptions): Promise<Uint8Array<ArrayBuffer>> {
  const W = 1500;
  const H = 2100;
  await document.fonts.ready;
  const sigImg = await loadSvgImage(svgEl);
  if (!qrImg.complete || qrImg.naturalWidth === 0) {
    await qrImg.decode().catch(() => undefined);
  }

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("Canvas 2D context unavailable");

  // Warm paper backdrop + soft top radial wash matching Layout.astro.
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W * 0.5, 0);
  ctx.scale(1.3, 0.9);
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.65);
  grad.addColorStop(0, WASH_TOP);
  grad.addColorStop(1, "rgba(241, 231, 212, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(-W, 0, W * 2, H * 1.3);
  ctx.restore();

  // Inner gallery card.
  const pad = 84;
  traceRoundedRect(ctx, pad, pad, W - pad * 2, H - pad * 2, 26);
  ctx.fillStyle = CARD;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = LINE;
  ctx.stroke();

  const cx = W / 2;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";

  // Vector wordmark signature.
  ctx.drawImage(sigImg, cx - 340, 178, 680, 99);

  // Studio location eyebrow + hairline rule.
  ctx.fillStyle = ACCENT;
  ctx.font = `700 27px ${SANS}`;
  drawTrackedUpper(
    ctx,
    "CALGARY, ALBERTA \u00B7 ORIGINAL PAINTINGS",
    cx,
    336,
    4.8,
  );
  ctx.fillStyle = LINE;
  ctx.fillRect(cx - 70, 376, 140, 3);

  // Main artist blurb.
  ctx.fillStyle = INK;
  ctx.font = `400 36px ${SANS}`;
  ctx.fillText(
    "Nature and abstract originals from her Calgary studio.",
    cx,
    452,
  );
  ctx.fillText("Prairie light, quiet water, and colour studies", cx, 508);
  ctx.fillText("sitting somewhere between landscape and feeling.", cx, 564);

  ctx.fillStyle = MUTED;
  ctx.font = `400 33px ${SANS}`;
  ctx.fillText("Every piece is painted by hand.", cx, 642);
  ctx.fillText(
    "Scan below for larger originals, prints, and studio updates.",
    cx,
    692,
  );

  // Painted impasto QR code inside a subtle rounded frame.
  const handle = normalizeInstagramHandle(instagram);
  const hasIg = handle !== "";
  const qrSize = hasIg ? 710 : 740;
  const qrX = cx - qrSize / 2;
  const qrY = 748;
  ctx.save();
  traceRoundedRect(ctx, qrX, qrY, qrSize, qrSize, 14);
  ctx.clip();
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
  ctx.restore();
  traceRoundedRect(ctx, qrX, qrY, qrSize, qrSize, 14);
  ctx.lineWidth = 3;
  ctx.strokeStyle = QR_BORDER;
  ctx.stroke();

  // Website + optional Instagram handle + footer line.
  ctx.fillStyle = INK;
  ctx.font = `550 68px ${SERIF}`;
  const urlY = hasIg ? 1564 : 1588;
  ctx.fillText("barbart.ca", cx, urlY);

  if (hasIg) {
    ctx.fillStyle = ACCENT;
    let fontSize = 34;
    ctx.font = `600 ${fontSize}px ${SANS}`;
    const igLine = `Instagram: ${handle}`;
    if (ctx.measureText(igLine).width > 1100) {
      fontSize = 28;
      ctx.font = `600 ${fontSize}px ${SANS}`;
    }
    if (ctx.measureText(igLine).width > 1100) {
      fontSize = 25;
      ctx.font = `600 ${fontSize}px ${SANS}`;
    }
    ctx.fillText(igLine, cx, 1628, 1120);
  }

  ctx.fillStyle = MUTED;
  ctx.font = `400 28px ${SANS}`;
  ctx.fillText(
    "Larger originals \u00B7 Prints \u00B7 New-work alerts",
    cx,
    1918,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) =>
        b !== null ? resolve(b) : reject(new Error("JPEG encode failed")),
      "image/jpeg",
      0.95,
    );
  });
  const jpegBytes = new Uint8Array(await blob.arrayBuffer());
  return buildJpegPdf(jpegBytes, W, H, 360, 504);
}
