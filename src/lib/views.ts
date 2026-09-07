/**
 * View-count words for the studio rows ("999 views", "1.5k views").
 * Lives in its own import-free module so node unit tests can load it
 * directly — src/lib keeps the extensionless style the bundler uses,
 * which node cannot resolve transitively.
 */

/** Whole days are exact; thousands and up compact to digits plus suffix. */
export function formatCompact(n: number): string {
  const units: Array<[number, string]> = [
    [1_000_000_000, "b"],
    [1_000_000, "m"],
    [1000, "k"],
  ];
  for (const [size, suffix] of units) {
    if (n >= size) {
      const scaled = n / size;
      // Floored (never rounded up into the next unit) to at most three
      // significant digits: 999k, never 1000k.
      const factor = scaled >= 100 ? 1 : scaled >= 10 ? 10 : 100;
      return `${Math.floor(scaled * factor) / factor}${suffix}`;
    }
  }
  return String(n);
}

/**
 * Row view counts in words — shared by the renderer and the patch.
 * Exact under a thousand ("999 views"), compact above it ("1.5k views",
 * "2m views"), so long counts never stretch their rows.
 */
export function viewsLabel(n: number): string {
  if (n === 1) return "1 view";
  if (n < 1000) return `${n} views`;
  return `${formatCompact(n)} views`;
}
