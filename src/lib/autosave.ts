/** Studio room autosave backups, so typed fields survive a refresh or
 * crash. This module handles shape and staleness. The caller handles
 * storage.
 *
 * A backup overrides the file only within a day. Older or unstamped
 * backups are more likely stale than useful, and an old backup could
 * silently uncheck Sold. In that case the file wins and the backup is
 * dropped.
 */

/** Backups older than this don't override the file. */
export const AUTOSAVE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface RoomBackup {
  title: string;
  price: string;
  medium: string;
  alt: string;
  desc: string;
  w: string;
  h: string;
  d: string;
  sold: boolean;
  publishOn: string;
  savedAt: number;
}

/** Parses a stored backup. Returns null when missing, malformed, or too
 * old, and callers then drop the entry. */
export function readBackup(raw: string | null, now: number): RoomBackup | null {
  if (raw === null) return null;
  let saved: unknown;
  try {
    saved = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (typeof saved !== "object" || saved === null) return null;
  const rec = saved as Record<string, unknown>;
  const savedAt = rec["savedAt"];
  if (typeof savedAt !== "number" || now - savedAt > AUTOSAVE_MAX_AGE_MS)
    return null;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  return {
    title: str(rec["title"]),
    price: str(rec["price"]),
    medium: str(rec["medium"]),
    alt: str(rec["alt"]),
    desc: str(rec["desc"]),
    w: str(rec["w"]),
    h: str(rec["h"]),
    d: str(rec["d"]),
    sold: rec["sold"] === true,
    publishOn: str(rec["publishOn"]),
    savedAt,
  };
}
