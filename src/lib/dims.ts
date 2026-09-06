/** Dimensions in inches. Null = not measured yet. Shared by admin + pages. */
export function formatDimensions(
  widthIn: number | null,
  heightIn: number | null,
  depthIn: number | null,
): string {
  if (widthIn === null || heightIn === null) return "";
  const trim = (n: number): string =>
    Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
  // Gallery style: one unit at the end — "24 × 36 in", "24 × 36 × 1 in".
  const face = `${trim(widthIn)} × ${trim(heightIn)}`;
  return depthIn === null ? `${face} in` : `${face} × ${trim(depthIn)} in`;
}
