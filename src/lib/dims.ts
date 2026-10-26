/** Formats dimensions in inches. Null means not measured yet. */
export function formatDimensions(
  widthIn: number | null,
  heightIn: number | null,
  depthIn: number | null,
): string {
  if (widthIn === null || heightIn === null) return "";
  const trim = (n: number): string =>
    Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
  // One unit at the end: "24 × 36 in", "24 × 36 × 1 in".
  const face = `${trim(widthIn)} × ${trim(heightIn)}`;
  return depthIn === null ? `${face} in` : `${face} × ${trim(depthIn)} in`;
}

/** The same size in centimetres, for buyers outside English: "91 × 91 ×
 * 3.8 cm". Under 10 cm keeps one decimal. */
export function formatDimensionsCm(
  widthIn: number | null,
  heightIn: number | null,
  depthIn: number | null,
): string {
  if (widthIn === null || heightIn === null) return "";
  const cm = (n: number): string => {
    const v = n * 2.54;
    return v < 10 ? String(Math.round(v * 10) / 10) : String(Math.round(v));
  };
  const face = `${cm(widthIn)} × ${cm(heightIn)}`;
  return depthIn === null ? `${face} cm` : `${face} × ${cm(depthIn)} cm`;
}

/** A size as a buyer in `locale` reads it: inches in English, centimetres
 * otherwise, with the inches after when `both` (the painting page). */
export function sizeFor(
  locale: string,
  widthIn: number | null,
  heightIn: number | null,
  depthIn: number | null,
  both = false,
): string {
  const inches = formatDimensions(widthIn, heightIn, depthIn);
  if (locale === "en" || inches === "") return inches;
  const cm = formatDimensionsCm(widthIn, heightIn, depthIn);
  return both ? `${cm} (${inches})` : cm;
}
