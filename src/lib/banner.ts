/** Homepage banner from src/content/announcement.txt. The first line may be
 * `expires: YYYY-MM-DD`, and the rest is the text. An empty file hides it.
 * The banner shows through the expiry date in local time, checked both at
 * build time and in the browser. */

export interface Banner {
  text: string;
  /** Last local date the banner shows (YYYY-MM-DD), or null for no end. */
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

/** Today's local date as YYYY-MM-DD, not UTC. */
export function localToday(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Expiry date for a banner saved today with the given duration. */
export function expiryForDuration(
  days: number | null,
  now: Date = new Date(),
): string | null {
  if (days === null) return null;
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return localToday(end);
}

/** True once the expiry date has passed. The banner still shows on that
 * date. */
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
