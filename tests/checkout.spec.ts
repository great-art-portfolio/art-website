import { expect, test, type Page } from "@playwright/test";

/**
 * Buy box on painting pages. /api/status and /api/checkout are routed, so
 * nothing reaches Stripe; the real flow is checked by hand in test mode.
 */

async function stripeStatus(page: Page, on: boolean): Promise<void> {
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: {
        stripe: on,
        shippo: false,
        socialPost: false,
        turnstileSiteKey: "",
        email: false,
        push: false,
      },
    }),
  );
}

test("no buy button while card checkout is off", async ({ page }) => {
  await stripeStatus(page, false);
  await page.goto("/paintings/night-reeds");
  await expect(page.getByRole("button", { name: "Interested?" })).toBeVisible();
  await expect(page.locator("#buy-box")).toBeHidden();
});

test("buy sends the page's painting and opens Stripe", async ({ page }) => {
  await stripeStatus(page, true);
  let sent: unknown = null;
  await page.route("**/api/checkout", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { url: "/thanks?painting=night-reeds" } });
  });
  await page.goto("/paintings/night-reeds");
  const buy = page.getByRole("button", { name: "Buy now · $140 CAD" });
  await expect(buy).toBeVisible();
  await expect(page.locator("#buy-box")).toContainText("e-transfer");
  await expect(
    page.getByRole("button", { name: "Ask a question" }),
  ).toBeVisible();
  await buy.click();
  await page.waitForURL(/\/thanks/);
  expect(sent).toEqual({
    slug: "night-reeds",
    title: "Night Reeds",
    priceCents: 14000,
  });
  await expect(page.getByRole("heading", { name: "Thank you!" })).toBeVisible();
});

test("a refused checkout explains itself", async ({ page }) => {
  await stripeStatus(page, true);
  await page.route("**/api/checkout", (route) =>
    route.fulfill({
      status: 409,
      json: { error: "Sorry, this painting has just sold." },
    }),
  );
  await page.goto("/paintings/night-reeds");
  await page.getByRole("button", { name: "Buy now · $140 CAD" }).click();
  await expect(page.locator("#buy-status")).toHaveText(
    "Sorry, this painting has just sold.",
  );
  await expect(
    page.getByRole("button", { name: "Buy now · $140 CAD" }),
  ).toBeEnabled();
});

test("checkout rejects a price the build doesn't have", async ({ request }) => {
  const res = await request.post("/api/checkout", {
    data: { slug: "night-reeds", title: "Night Reeds", priceCents: 1 },
  });
  // 501 with Stripe off (CI), 409 with it on: never a Stripe page.
  expect([409, 501]).toContain(res.status());
});
