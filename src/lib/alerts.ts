/** Publish alerts: the browser ping and the email to her list when a
 * painting goes live. Shared by the painting rooms (publish now) and the
 * studio's scheduled publishing (alerts remembered on the painting). */
import { api } from "./api";
import { errorMessage } from "./errors";
import type { AlertChoice } from "./painting-edit";

/** Sends the chosen alerts and returns a sentence for the status line
 * (with a leading space), or "" when none were chosen. */
export async function sendPublishAlerts(choice: AlertChoice): Promise<string> {
  const { push, email } = choice;
  if (!push && !email) return "";
  try {
    // One Worker call only reaches about 40 browsers, so pushes are paged
    // by cursor. The email goes out once, with the first batch.
    const r = await api.notifyCollectors({ push, email });
    let sent = r.sent;
    let cursor = r.nextCursor;
    while (push && cursor !== null && cursor !== undefined) {
      const next = await api.notifyCollectors({ push, email: false, cursor });
      sent += next.sent;
      cursor = next.nextCursor;
    }
    const bits: string[] = [];
    if (push) bits.push(`Notified ${sent} of ${r.total} subscribers.`);
    if (email) {
      bits.push(
        r.emailTotal === 0
          ? "Email list is empty."
          : r.emailed
            ? `Emailed ${r.emailTotal}.`
            : "Email not sent (mail isn't set up).",
      );
    }
    return ` ${bits.join(" ")}`;
  } catch (err) {
    return ` Couldn't send the alerts: ${errorMessage(err)}`;
  }
}
