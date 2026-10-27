/** Sends the alerts she ticked for paintings the nightly workflow just
 * published (publish-due.mjs --alerts-file). Waits until the painting's
 * page is live, so the email's photo and link work, then asks the site to
 * send the painting's email with ALERTS_TOKEN, which /api/notify accepts for
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

/** Asks the site to email the list about the painting at `slug`. Returns
 * how many addresses it went to, and whether a tried send failed. */
export async function sendAlerts(site, token, slug = "") {
  const res = await fetch(`${site}/api/notify`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: true, slug }),
  });
  if (!res.ok)
    throw new Error(`notify answered ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return {
    emailed: data.emailed === true ? (data.emailTotal ?? 0) : 0,
    total: data.emailTotal ?? 0,
    failed: data.failed === true,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const alerts = JSON.parse(await readFile(process.argv[2] ?? "", "utf8"));
  if (!alerts.email) {
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
  const r = await sendAlerts(SITE, token, alerts.slug);
  // A list with people on it that got nothing is a failure, so the run goes
  // red; the cause is in the site's logs (`pnpm logs --event broadcast`).
  if (r.failed || (r.total > 0 && r.emailed === 0)) {
    console.error(
      `The publish email to ${r.total} didn't go out. See \`pnpm logs --event broadcast\`.`,
    );
    process.exit(1);
  }
  console.log(`Publish email sent to ${r.emailed}.`);
}
