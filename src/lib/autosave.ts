/** Studio room autosave backups: typed fields that survive a refresh or
 * crash. Pure node-safe module — the island owns storage, this owns
 * shape and staleness.
 *
 * A backup only ever overrides the file for a day. Anything older (or
 * unstamped, which predates expiry) is likelier stale than precious —
 * an old backup silently unchecking Sold is worse than retyping a line.
 * The file wins, and the stale entry goes away.
 */

/** A backup older than this never overrides the room (refresh/crash
 * recovery happens within hours, not weeks). */
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

/** Parse a stored backup; null means no backup, garbled, or too old to
 * trust against the file. Callers drop the entry on null. */
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
