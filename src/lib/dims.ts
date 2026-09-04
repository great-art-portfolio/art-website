/** Dimensions in inches. Null = not measured yet. Shared by admin + pages. */
export function formatDimensions(
  widthIn: number | null,
  heightIn: number | null,
  depthIn: number | null,
): string {
  if (widthIn === null || heightIn === null) return "";
  const trim = (n: number): string =>
    Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
  const face = `${trim(widthIn)} × ${trim(heightIn)} in`;
  return depthIn === null ? face : `${face} × ${trim(depthIn)} in deep`;
}
