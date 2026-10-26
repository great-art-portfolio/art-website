/** Publish alerts: the email to her list when a painting goes live. Shared
 * by the painting rooms (publish now) and the studio's scheduled publishing
 * (alerts remembered on the painting). */
import { api } from "./api";
import { errorMessage } from "./errors";
import type { AlertChoice } from "./painting-edit";

/** Sends the chosen alerts and returns a sentence for the status line
 * (with a leading space), or "" when none were chosen. */
export async function sendPublishAlerts(choice: AlertChoice): Promise<string> {
  if (!choice.email) return "";
  try {
    const r = await api.notifyCollectors();
    return r.emailTotal === 0
      ? " Email list is empty."
      : r.emailed
        ? ` Emailed ${r.emailTotal}.`
        : " Email not sent (mail isn't set up).";
  } catch (err) {
    return ` Couldn't send the email: ${errorMessage(err)}`;
  }
}
