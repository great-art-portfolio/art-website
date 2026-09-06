/**
 * Homepage banner: one banner at a time, optionally time-limited.
 * File format (src/content/announcement.txt):
 *
 *   expires: 2026-09-19
 *   Find me at the Lilac Festival this Sunday!
 *
 * The first line is an optional `expires: YYYY-MM-DD`; everything after
 * is the banner text. Empty file = hidden. The banner shows through its
 * expiry date (local time) and hides after — enforced at build time when
 * possible and in the browser for expiry between deploys.
 */

export interface Banner {
  text: string;
  /** Local YYYY-MM-DD the banner shows through, or null for no end date. */
  expires: string | null;
}

export function parseAnnouncement(raw: string): Banner {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  let expires: string | null = null;
  let start = 0;
  const m = lines[0]?.match(/^\s*expires\s*:\s*(\d{4}-\d{2}-\d{2})\s*$/i);
  if (m !== undefined && m !== null) {
    expires = m[1] ?? null;
    start = 1;
  }
  return { text: lines.slice(start).join("\n").trim(), expires };
}

export function formatAnnouncement(
  text: string,
  expires: string | null,
): string {
  const body = text.trim().slice(0, 280);
  if (body === "") return "";
  return expires === null ? body : `expires: ${expires}\n${body}`;
}

/** Local YYYY-MM-DD (the studio's clock, not UTC). */
export function localToday(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** End-of-life date for a banner saved today with the given lifetime. */
export function expiryForDuration(
  days: number | null,
  now: Date = new Date(),
): string | null {
  if (days === null) return null;
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return localToday(end);
}

/** True once the expiry date has passed (shows through that date). */
export function isExpired(
  expires: string | null,
  today: string = localToday(),
): boolean {
  return expires !== null && today > expires;
}

/** Whole days from today until expiry (negative when past). */
export function daysLeft(
  expires: string,
  today: string = localToday(),
): number {
  const ms =
    Date.parse(`${expires}T00:00:00`) - Date.parse(`${today}T00:00:00`);
  return Math.round(ms / (24 * 60 * 60 * 1000));
}
