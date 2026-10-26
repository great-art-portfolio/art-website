/** Plain-words helpers for the studio's Metrics page. */

/** "Up from about 50 the month before." — or "" with nothing to compare. */
export function trendSentence(now: number, before: number): string {
  if (before === 0) return now === 0 ? "" : "Nothing to compare with yet.";
  const change = (now - before) / before;
  if (Math.abs(change) < 0.1) return "About the same as the month before.";
  return `${change > 0 ? "Up" : "Down"} from about ${before.toLocaleString()} the month before.`;
}

/** "Canada" from "CA"; the code itself when the browser can't name it. */
export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function deviceLabel(kind: "phone" | "computer" | "tablet"): string {
  return kind === "phone"
    ? "Phones"
    : kind === "tablet"
      ? "Tablets"
      : "Computers";
}

/** "Oct 21" from "2026-10-21", read as a calendar day (no time zone shift). */
export function dayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (y === undefined || m === undefined || d === undefined) return date;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "about 50 visits", "1 visit", "no visits". */
export function visitsLabel(n: number): string {
  if (n === 0) return "no visits";
  if (n === 1) return "1 visit";
  return `about ${n.toLocaleString()} visits`;
}

/** Bars for a viewBox `width` × `height`: one slot per day with a 2px gap,
 * heights against the busiest day. A day with no visits has no bar. */
export function bars(
  values: readonly number[],
  width = 300,
  height = 80,
): Array<{ x: number; y: number; w: number; h: number }> {
  const slot = width / Math.max(1, values.length);
  const gap = Math.min(2, slot / 3);
  const top = Math.max(1, ...values);
  return values.map((v, i) => {
    const h = v <= 0 ? 0 : Math.max(2, (v / top) * height);
    return { x: i * slot + gap / 2, y: height - h, w: slot - gap, h };
  });
}
