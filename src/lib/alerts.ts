/** Publish alerts: the email to her list when a painting goes live. Shared
 * by the painting rooms (publish now) and the studio's scheduled publishing
 * (alerts remembered on the painting). */
import { api } from "./api";
import { errorMessage } from "./errors";
import type { AlertChoice } from "./painting-edit";

/** Sends the chosen alerts about the painting at `file` and returns a
 * sentence for the status line (with a leading space), or "" when none
 * were chosen. */
export async function sendPublishAlerts(
  choice: AlertChoice,
  file: string,
): Promise<string> {
  if (!choice.email) return "";
  try {
    const r = await api.notifyCollectors(file);
    const people = r.emailTotal === 1 ? "1 person" : `${r.emailTotal} people`;
    return r.emailTotal === 0
      ? " Email list is empty."
      : !r.emailed
        ? " Email not sent (mail isn't set up)."
        : r.scheduled
          ? ` The email to ${people} goes out once the page is live, in about 10 minutes.`
          : ` Emailed ${people}.`;
  } catch (err) {
    return ` Couldn't send the email: ${errorMessage(err)}`;
  }
}
