/** The heads-up before the site's GitHub key runs out. Saving stops on
 * that day, so the studio warns her three weeks ahead, in plain words. */

export const KEY_WARN_DAYS = 21;

/** The warning for an expiry day ("YYYY-MM-DD") seen from `today`, or ""
 * when it's far off or the key never expires. */
export function keyWarning(expires: string | null, today: string): string {
  if (expires === null || !/^\d{4}-\d{2}-\d{2}$/.test(expires)) return "";
  const days = Math.round(
    (Date.parse(`${expires}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86_400_000,
  );
  if (days > KEY_WARN_DAYS) return "";
  const day = new Date(`${expires}T12:00:00Z`).toLocaleDateString("en-CA", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  return days <= 0
    ? `Saving stopped on ${day}, when the site's GitHub key ran out. Ask Chris to renew it.`
    : `Heads up: saving stops on ${day}, when the site's GitHub key runs out. Ask Chris to renew it before then.`;
}
