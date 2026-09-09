import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isExpired, localToday, parseAnnouncement } from "../src/lib/banner";

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

test("painting page shows the Interested button, not the form", async ({
  page,
}) => {
  await page.goto("/paintings/night-reeds");
  await expect(page.getByRole("button", { name: "Interested?" })).toBeVisible();
  await expect(page.locator("#inquiry-form")).toBeHidden();
});

test("reduced motion keeps the nav button planted", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Both nav variants: Notify me at home, Add painting in the studio.
  for (const url of ["/", "/admin"]) {
    await page.goto(url);
    const cta = page.locator(".nav-cta");
    await cta.hover();
    await expect(cta).toHaveCSS("transform", "none");
  }
});

test("clicking Interested reveals the form and focuses Name", async ({
  page,
}) => {
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
  await expect(
    adminPage.locator('#admin-bar a[href^="/admin/paintings/"]'),
  ).toHaveText("Edit in the studio");
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

test("homepage keeps signup in a modal and shows the baked banner as-is", async ({
  page,
}) => {
  await page.goto("/");
  // The signup lives in a closed modal, not a page section.
  await expect(page.locator("#notify-dialog")).toBeAttached();
  await expect(page.locator("#notify-dialog")).toBeHidden();
  await expect(page.locator("#notify-card")).toHaveCount(0);
  // Whatever the working tree baked: an empty (or expired) banner hides,
  // a live one shows with its wording — dev may hold a real banner.
  const raw = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "src",
      "content",
      "announcement.txt",
    ),
    "utf8",
  );
  const parsed = parseAnnouncement(raw);
  const expected = isExpired(parsed.expires, localToday()) ? "" : parsed.text;
  if (expected === "") {
    await expect(page.locator(".announce")).toHaveCount(0);
  } else {
    await expect(page.locator(".announce")).toHaveText(expected);
  }
});

test("pages fade in on swap, even under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  // Firing the swap event must start an author-run fade on #main —
  // Web Animations aren't covered by the transition spec's
  // reduced-motion kill the way pseudo-element keyframes are.
  const running = await page.evaluate(() => {
    document.dispatchEvent(new Event("astro:after-swap"));
    const main = document.getElementById("main");
    return main === null ? 0 : main.getAnimations().length;
  });
  expect(running).toBeGreaterThanOrEqual(1);
});

test("notify buttons open the signup modal", async ({ page }) => {
  await page.goto("/");
  // Nav and hero open a modal — the page never scrolls anywhere.
  for (const opener of ["#notify-nav", "#notify-hero"]) {
    await page.locator(opener).click();
    await expect(page.locator("#notify-dialog")).toBeVisible();
    // The signup itself answers (headless denies notification
    // permission, so the button wears its blocked state here).
    await expect(page.locator("#notify-btn")).toBeAttached();
    await expect(page).not.toHaveURL(/#notify-card/);
    await page.locator("#notify-close").click();
    await expect(page.locator("#notify-dialog")).toBeHidden();
  }
  // The same modal answers from a painting page — the nav owns it
  // everywhere, not just at home.
  await page.goto("/paintings/night-reeds");
  await page.locator("#notify-nav").click();
  await expect(page.locator("#notify-dialog")).toBeVisible();
  await expect(page.locator("#notify-email-form")).toBeVisible();
});

test("email capture form joins the list", async ({ page }) => {
  await page.goto("/");
  await page.locator("#notify-nav").click();
  await expect(page.locator("#notify-dialog")).toBeVisible();
  // The email channel shows in every browser — no push needed.
  await expect(page.locator("#notify-email-form")).toBeVisible();
  await page.locator("#notify-email").fill("e2e-fan@example.com");
  await page.locator("#notify-email-form button[type=submit]").click();
  await expect(page.locator("#notify-status")).toContainText(
    "Check your inbox",
  );
  // Status answers in the theme's accent, not body-copy muted.
  await expect(page.locator("#notify-status")).toHaveCSS(
    "color",
    "rgb(164, 74, 36)",
  );
});

test("email field and button share a row", async ({ page }) => {
  await page.goto("/");
  await page.locator("#notify-nav").click();
  // One frame for both boxes: sequential reads can straddle a font swap
  // under load and report a gap that was never on screen together.
  const { field, btn } = await page.evaluate(() => {
    const box = (sel: string): DOMRect =>
      (document.querySelector(sel) as HTMLElement).getBoundingClientRect();
    return {
      field: box("#notify-email").toJSON(),
      btn: box("#notify-email-form button[type=submit]").toJSON(),
    };
  });
  // Side by side: same height, bottoms lined up with the box (not
  // the label text), and the button starts right of the field instead
  // of below it.
  expect(Math.abs(field.height - btn.height)).toBeLessThan(4);
  const fieldBottom = field.y + field.height;
  const btnBottom = btn.y + btn.height;
  expect(Math.abs(fieldBottom - btnBottom)).toBeLessThan(4);
  expect(btn.x).toBeGreaterThan(field.x + field.width / 2);
});

test("modal status fades away on its own", async ({ page }) => {
  await page.goto("/");
  await page.locator("#notify-nav").click();
  await page.locator("#notify-email").fill("e2e-fan@example.com");
  await page.locator("#notify-email-form button[type=submit]").click();
  const hint = page.locator("#notify-status");
  await expect(hint).toContainText("Check your inbox");
  await expect(hint).toBeEmpty({ timeout: 10_000 });
});

test("modal status unfolds the card, then folds away", async ({ page }) => {
  await page.goto("/");
  await page.locator("#notify-nav").click();
  const dialog = page.locator("#notify-dialog");
  const wrap = page.locator("#notify-status-wrap");
  await page.locator("#notify-email").fill("e2e-fan@example.com");
  await page.locator("#notify-email-form button[type=submit]").click();
  const hint = page.locator("#notify-status");
  await expect(hint).toContainText("Check your inbox");
  // Unfolded: the row holds real height and the card grew for it.
  await expect(wrap).toHaveCSS("grid-template-rows", /[1-9]/);
  const mid = await dialog.evaluate((el) => el.getBoundingClientRect().height);
  // The fade clears the words and the wrapper folds flat — nothing
  // reserved, nothing left behind.
  await expect(hint).toBeEmpty({ timeout: 10_000 });
  await expect(wrap).toHaveCSS("grid-template-rows", "0px");
  const end = await dialog.evaluate((el) => el.getBoundingClientRect().height);
  expect(end).toBeLessThan(mid);
});

test("blocked push state stays put, not faded", async ({ page }) => {
  // Headless denies notification permission, so the modal opens
  // already wearing its blocked state.
  await page.goto("/");
  await page.locator("#notify-nav").click();
  const hint = page.locator("#notify-status");
  await expect(hint).toContainText("blocked");
  // Past the fade delay: a state she must act on never clears itself.
  await page.waitForTimeout(6000);
  await expect(hint).toContainText("blocked");
});

test("buyer signup accepts a good address, rejects a bad one", async ({
  request,
}) => {
  const ok = await request.post("/api/collectors", {
    data: { email: "api-fan@example.com" },
  });
  expect(ok.status()).toBe(201);
  expect((await ok.json()).ok).toBe(true);

  const bad = await request.post("/api/collectors", {
    data: { email: "not-an-email" },
  });
  expect(bad.status()).toBe(400);
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
  // No GitHub behind the dev API: the baked-in index renders with practice
  // merges — thumbnails, buyer links, and studio doors work, real
  // publishing stays live-only.
  const rows = page.locator('#edit-list a.row-title[href^="/paintings/"]');
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  expect(await rows.count()).toBeGreaterThan(0);
  await expect(page.locator("#collection-title")).toHaveText("Available");
  await expect(page.locator("#edit-list img.thumb").first()).toBeVisible();
  // One studio door per card — drafts link their titles to the room.
  await expect(page.locator("#edit-list .row-edit")).toHaveCount(
    await page.locator("#edit-list .row-card").count(),
  );
  await expect(page.locator("#collection-refresh")).toBeHidden();
  await expect(page.locator("#collection-dev")).toContainText(
    "Development only",
  );
  // Nothing to toast about on a quiet load.
  await expect(page.locator("#admin-status")).toBeHidden();
  // No Most-viewed card anywhere, in any environment — counts live in
  // the rows, and an empty answer leaves them count-less with no note.
  await expect(page.locator("#sec-views")).toHaveCount(0);
  await expect(page.locator("#edit-list")).not.toContainText("preview");
});
