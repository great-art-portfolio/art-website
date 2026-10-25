/** Sends the alerts she ticked for paintings the nightly workflow just
 * published (publish-due.mjs --alerts-file). Waits until the painting's
 * page is live, so the email's link shows it, then asks the site to send
 * the standard alerts with ALERTS_TOKEN, which /api/notify accepts for
 * exactly that and nothing else. Exits non-zero on failure, so a missed
 * alert shows as a red run.
 *
 *   ALERTS_TOKEN=… node scripts/send-scheduled-alerts.mjs <alerts.json>
 */
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const SITE = process.env.SITE_URL ?? "https://barbart.ca";
const WAIT_MS = 15 * 60 * 1000;
const POLL_MS = 30 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Waits for the page to answer 200, up to `waitMs`. False on timeout. */
export async function waitForPage(url, waitMs = WAIT_MS, pollMs = POLL_MS) {
  const until = Date.now() + waitMs;
  for (;;) {
    const res = await fetch(url, { redirect: "manual" }).catch(() => null);
    if (res?.status === 200) return true;
    if (Date.now() + pollMs > until) return false;
    await sleep(pollMs);
  }
}

/** Posts the publish alert, paging the push list. Returns what was sent. */
export async function sendAlerts(site, token, alerts) {
  const post = async (body) => {
    const res = await fetch(`${site}/api/notify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok)
      throw new Error(`notify answered ${res.status}: ${await res.text()}`);
    return await res.json();
  };
  const first = await post({ push: alerts.push, email: alerts.email });
  let sent = first.sent ?? 0;
  let cursor = first.nextCursor;
  while (alerts.push && cursor !== null && cursor !== undefined) {
    const next = await post({ push: true, email: false, cursor });
    sent += next.sent ?? 0;
    cursor = next.nextCursor;
  }
  return {
    pushed: sent,
    total: first.total ?? 0,
    emailed: first.emailTotal ?? 0,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const alerts = JSON.parse(await readFile(process.argv[2] ?? "", "utf8"));
  if (!alerts.push && !alerts.email) {
    console.log("No alerts were ticked.");
    process.exit(0);
  }
  const token = process.env.ALERTS_TOKEN ?? "";
  if (token === "") {
    console.error(
      "ALERTS_TOKEN is not set, so the ticked alerts can't go out.",
    );
    process.exit(1);
  }
  const live = await waitForPage(`${SITE}/paintings/${alerts.slug}`);
  if (!live) console.log("The page isn't live yet; sending anyway.");
  const r = await sendAlerts(SITE, token, alerts);
  console.log(
    `Alerts sent: ${alerts.push ? `${r.pushed} of ${r.total} browsers` : "no browsers"}, ${alerts.email ? `email to ${r.emailed}` : "no email"}.`,
  );
}
