import { expect, test } from "@playwright/test";

/**
 * Smoke suite: the regressions that previously shipped silently
 * (dead inline scripts showing button+form together) plus the API
 * validation paths that need no secrets. Live-secret delivery
 * (real GitHub commits, real emails) stays a manual checklist.
 *
 * WARNING: wrangler pages dev auto-loads .env, so local runs may hold
 * REAL secrets. Never add a test that delivers anything (commits,
 * emails, push fan-out) — validation shapes and read-only paths only.
 */

test("painting page shows the Interested button, not the form", async ({ page }) => {
  await page.goto("/paintings/night-reeds");
  await expect(page.getByRole("button", { name: "Interested?" })).toBeVisible();
  await expect(page.locator("#inquiry-form")).toBeHidden();
});

test("reduced motion keeps the nav button planted", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const cta = page.locator(".nav-cta");
  await cta.hover();
  await expect(cta).toHaveCSS("transform", "none");
});

test("clicking Interested reveals the form and focuses Name", async ({ page }) => {
  await page.goto("/paintings/night-reeds");
  await page.getByRole("button", { name: "Interested?" }).click();
  await expect(page.locator("#inquiry-form")).toBeVisible();
  await expect(page.getByRole("button", { name: "Interested?" })).toBeHidden();
  await expect(page.locator('#inquiry-form input[name="name"]')).toBeFocused();
});

test("admin mode toolbar appears only with a stored token", async ({
  browser,
}) => {
  const plain = await browser.newContext();
  await (await plain.newPage()).goto("/paintings/night-reeds");
  const plainPage = plain.pages()[0];
  await expect(plainPage.locator("#admin-bar")).toBeHidden();
  await plain.close();

  const authed = await browser.newContext();
  await authed.addInitScript(() =>
    sessionStorage.setItem("ADMIN_API_TOKEN", "test"),
  );
  const adminPage = await authed.newPage();
  await adminPage.goto("/paintings/night-reeds");
  await expect(adminPage.locator("#admin-bar")).toBeVisible();
  await expect(adminPage.locator("#admin-edit")).toBeHidden();
  await authed.close();
});

test("without JS the inquiry form stays open (progressive enhancement)", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/paintings/night-reeds");
  await expect(page.locator("#inquiry-form")).toBeVisible();
  await context.close();
});

test("homepage renders the notify card and hides the empty banner", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#notify-card")).toBeAttached();
  await expect(page.locator(".announce")).toHaveCount(0);
});

test("inquiry honeypot is accepted without delivery", async ({ request }) => {
  const res = await request.post("/api/inquiries", {
    data: {
      paintingTitle: "Test",
      priceCents: 100,
      name: "Bot",
      email: "bot@example.com",
      message: "spam",
      website: "http://spam.example",
    },
  });
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).ok).toBe(true);
});

test("inquiry validation rejects a bad email", async ({ request }) => {
  const res = await request.post("/api/inquiries", {
    data: {
      paintingTitle: "Night Reeds",
      priceCents: 14000,
      name: "Buyer",
      email: "not-an-email",
      message: "Hi",
      website: "",
    },
  });
  expect(res.status()).toBe(400);
});

test("analytics returns a views array (unconfigured shape without secrets)", async ({
  request,
}) => {
  const res = await request.get("/api/analytics");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  // Without secrets: { unconfigured: true, views: [] }. With a real token
  // (local .env): live rows. Either way the contract is an array.
  expect(Array.isArray(body.views)).toBe(true);
});

test("admin explains itself gracefully without a publishing backend", async ({
  page,
}) => {
  await page.goto("/admin");
  // No GitHub behind the dev API: the baked-in list renders read-only —
  // rows and links work, editing stays live-only.
  const rows = page.locator('#edit-list a[href^="/paintings/"]');
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  expect(await rows.count()).toBeGreaterThan(0);
  await expect(page.locator("#edit-list button")).toHaveCount(0);
  await expect(page.locator("#collection-refresh")).toBeHidden();
  await expect(page.locator("#collection-note")).toContainText("Editing needs the live site");
  await expect(page.locator("#collection-note")).toBeVisible();
  // Nothing to toast about — the note lives in the Collection card.
  await expect(page.locator("#admin-status")).toBeHidden();
  // No secrets locally: Cloudflare answers 200 with zero rows, so the
  // views card hides instead of reporting. (The local-preview wording only
  // appears when the API itself is down — covered in admin-studio.)
  await expect(page.locator("#sec-views")).toBeHidden();
});
