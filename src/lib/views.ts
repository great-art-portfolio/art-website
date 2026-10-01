/**
 * View-count labels for the studio rows ("999 views", "1.5k views"). The
 * module has no imports so node unit tests can load it directly. Node can't
 * resolve the extensionless imports used elsewhere in src/lib.
 */

/** Exact below a thousand. Larger values compact to digits plus a suffix. */
export function formatCompact(n: number): string {
  const units: Array<[number, string]> = [
    [1_000_000_000, "b"],
    [1_000_000, "m"],
    [1000, "k"],
  ];
  for (const [size, suffix] of units) {
    if (n >= size) {
      const scaled = n / size;
      // Floor to at most three significant digits so 999.9k shows as 999k,
      // not 1000k.
      const factor = scaled >= 100 ? 1 : scaled >= 10 ? 10 : 100;
      return `${Math.floor(scaled * factor) / factor}${suffix}`;
    }
  }
  return String(n);
}

/**
 * Row view-count label, shared by the renderer and the in-place patch.
 * Exact under a thousand ("999 views") and compact above ("1.5k views",
 * "2m views") so long counts don't widen rows.
 */
export function viewsLabel(n: number): string {
  if (n === 1) return "1 view";
  if (n < 1000) return `${n} views`;
  return `${formatCompact(n)} views`;
}
