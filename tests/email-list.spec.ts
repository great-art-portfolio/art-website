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

test("keyless joins fail loudly, or round-trip the dev mock", async ({
  request,
}) => {
  const email = `e2e-${Date.now()}@example.com`;
  // The dev mock (local .dev.vars only) answers joins itself; without it
  // a keyless server has no list. The admin count tells the modes apart.
  const mode = await request.get("/api/collectors");
  if (mode.status() === 200) {
    // Mock round trip, Resend never involved — counts move relative to
    // whatever earlier dev-testing rows linger.
    const before = (await mode.json()).total;
    const sub = await request.post("/api/collectors", { data: { email } });
    expect(sub.status()).toBe(201);
    const link = new URL((await sub.json()).devConfirmUrl);
    const confirmed = await request.post("/api/collectors", {
      data: {
        action: "confirm",
        email: link.searchParams.get("email"),
        token: link.searchParams.get("token"),
      },
    });
    expect(confirmed.status()).toBe(200);
    const joined = await request.get("/api/collectors");
    expect(await joined.json()).toEqual({ total: before + 1 });
    const left = await request.post("/api/collectors", {
      data: { action: "unsubscribe", email },
    });
    expect(left.status()).toBe(200);
    const empty = await request.get("/api/collectors");
    expect(await empty.json()).toEqual({ total: before });
    return;
  }
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

test("dev confirm link visits instead of copying", async ({ page }) => {
  // The mock answers the join itself; the box must offer the loop as a
  // link that goes there, not words to copy.
  await page.route("**/api/collectors", async (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        already: false,
        emailed: true,
        devConfirmUrl:
          "http://127.0.0.1:4331/email/confirmed?email=t%40example.com&token=t",
      }),
    }),
  );
  await page.goto("/");
  await page.locator("#notify-nav").click();
  await page.locator("#notify-email").fill("t@example.com");
  await page.locator("#notify-email-form button[type=submit]").click();
  const link = page.locator("#notify-status a");
  await expect(link).toHaveText("open the confirm page");
  // Nothing but the link — no leading words.
  await expect(page.locator("#notify-status")).toHaveText(
    "open the confirm page",
  );
  // Status lines fade after five seconds — the link must outlive that.
  await page.waitForTimeout(5500);
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/email\/confirmed/);
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
