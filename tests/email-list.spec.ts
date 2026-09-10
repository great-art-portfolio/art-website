import { expect, test } from "@playwright/test";

/** Keyless email-list behavior: validation, setup errors, forged links, page
 * copy. The round trip is unit-covered with stubbed fetch; e2e never touches
 * Resend. */

test("rejects a bad address before touching Resend", async ({ request }) => {
  const res = await request.post("/api/collectors", {
    data: { email: "nope" },
  });
  expect(res.status()).toBe(400);
});

test("says the list isn't set up without a key", async ({ request }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const sub = await request.post("/api/collectors", { data: { email } });
  expect(sub.status()).toBe(500);
  const confirmed = await request.post("/api/collectors", {
    data: { action: "confirm", email, token: "x" },
  });
  expect(confirmed.status()).toBe(400);
  const left = await request.post("/api/collectors", {
    data: { action: "unsubscribe", email },
  });
  expect(left.status()).toBe(500);
});

test("tampered links don't confirm", async ({ page }) => {
  await page.goto(
    "/email/confirmed?email=a%40example.com&token=forged-token-here",
  );
  await expect(page.locator("#email-token-say")).toContainText("didn't work");
});

test("pages without links explain themselves", async ({ page }) => {
  await page.goto("/email/confirmed");
  await expect(page.locator("#email-token-say")).toContainText(
    "needs its link",
  );
  await page.goto("/email/goodbye");
  await expect(page.locator("#email-token-say")).toContainText(
    "needs its link",
  );
});

test("notify box validates before sending", async ({ page }) => {
  await page.goto("/");
  await page.locator("#notify-nav").click();
  // The drawer's async push check writes the shared hint once — wait for
  // it to settle so the validation message below is the final word.
  await expect(page.locator("#notify-status")).toContainText("blocked");
  // "missing@tld" clears the browser's own email check but fails the
  // site's stricter one, so the reply comes from the page script.
  await page.locator("#notify-email").fill("missing@tld");
  await page.locator("#notify-email-form button[type=submit]").click();
  await expect(page.locator("#notify-status")).toContainText(
    "doesn't look right",
  );
});
