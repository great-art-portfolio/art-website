import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isExpired, localToday, parseAnnouncement } from "../src/lib/banner";

/**
 * Smoke tests for past regressions and API validation that needs no secrets.
 * Delivery with live secrets is checked manually.
 *
 * wrangler pages dev loads .env automatically, so a local run may have real
 * secrets. Don't add tests that deliver anything (commits, emails, push);
 * stick to validation and read-only paths.
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
  // The nav shows "Notify me" on the site and "Add painting" in the studio.
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
  const plainPage = await plain.newPage();
  await plainPage.goto("/paintings/night-reeds");
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

test("the inquiry form arrives folded, so a refresh never flashes it", async ({
  request,
}) => {
  const html = await (await request.get("/paintings/night-reeds")).text();
  expect(html).toMatch(/<form id="inquiry-form"[^>]*\shidden/);
  expect(html).not.toMatch(/<button[^>]*id="inquiry-reveal"[^>]*\shidden/);
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
  // The signup is in a closed modal, not a page section.
  await expect(page.locator("#notify-dialog")).toBeAttached();
  await expect(page.locator("#notify-dialog")).toBeHidden();
  await expect(page.locator("#notify-card")).toHaveCount(0);
  // Depends on the built content. An empty or expired banner is hidden and a
  // current one is shown, since dev may have a real banner.
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
  // The swap event starts a scripted fade on #main. Web Animations aren't
  // disabled by the reduced-motion rule that covers pseudo-element keyframes,
  // so this checks them separately.
  const running = await page.evaluate(() => {
    document.dispatchEvent(new Event("astro:after-swap"));
    const main = document.getElementById("main");
    return main === null ? 0 : main.getAnimations().length;
  });
  expect(running).toBeGreaterThanOrEqual(1);
});

test("notify buttons open the signup modal", async ({ page }) => {
  await page.goto("/");
  // The nav and hero buttons open a modal without scrolling the page.
  for (const opener of ["#notify-nav", "#notify-hero"]) {
    await page.locator(opener).click();
    await expect(page.locator("#notify-dialog")).toBeVisible();
    // The signup responds: the email form is wired.
    await expect(page.locator("#notify-dialog")).toHaveAttribute(
      "data-ready",
      "",
    );
    await expect(page).not.toHaveURL(/#notify-card/);
    await page.locator("#notify-close").click();
    await expect(page.locator("#notify-dialog")).toBeHidden();
  }
  // The same modal opens from a painting page, since it belongs to the nav.
  await page.goto("/paintings/night-reeds");
  await page.locator("#notify-nav").click();
  await expect(page.locator("#notify-dialog")).toBeVisible();
  await expect(page.locator("#notify-email-form")).toBeVisible();
});

test("email capture form answers in accent", async ({ page }) => {
  await page.goto("/");
  await page.locator("#notify-nav").click();
  await expect(page.locator("#notify-dialog")).toBeVisible();
  // The email option shows in every browser, with or without push support.
  await expect(page.locator("#notify-email-form")).toBeVisible();
  // A bad address fails client-side, so this works with the real list, the
  // dev mock, or no backend. Wait for the form to be wired first so it can't
  // race the validation message.
  await expect(page.locator("#notify-dialog")).toHaveAttribute(
    "data-ready",
    "",
  );
  await page.locator("#notify-email").fill("missing@tld");
  await page.locator("#notify-email-form button[type=submit]").click();
  await expect(page.locator("#notify-status")).toContainText(
    "doesn't look right",
  );
  // The status text uses the theme accent color, not the muted body color.
  await expect(page.locator("#notify-status")).toHaveCSS(
    "color",
    /164, 74, 36|0\.622 0\.289 0\.133/,
  );
});

test("email comes first: field and Join span the card, quiet links below", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#notify-nav").click();
  await expect(page.locator("#notify-dialog")).toHaveAttribute(
    "data-ready",
    "",
  );
  // Measure in one frame. Separate reads can land on either side of a font
  // swap and report a gap that never existed.
  const { dialog, field, join, leave } = await page.evaluate(() => {
    const box = (sel: string) =>
      (document.querySelector(sel) as HTMLElement)
        .getBoundingClientRect()
        .toJSON() as DOMRect;
    return {
      dialog: box("#notify-dialog"),
      field: box("#notify-email"),
      join: box("#notify-email-form button[type=submit]"),
      leave: box("#notify-email-leave"),
    };
  });
  expect(field.width).toBeGreaterThan(dialog.width * 0.7);
  // Join is full width under the field, on one line.
  expect(join.y).toBeGreaterThanOrEqual(field.y + field.height);
  expect(Math.abs(join.width - field.width)).toBeLessThan(2);
  expect(join.height).toBeLessThan(56);
  // Leave is a small text button under Join, at the right edge.
  expect(leave.y).toBeGreaterThanOrEqual(join.y + join.height);
  expect(leave.height).toBeGreaterThanOrEqual(40);
  expect(Math.abs(leave.x + leave.width - (join.x + join.width))).toBeLessThan(
    2,
  );
});

test("modal status fades away on its own", async ({ page }) => {
  await page.goto("/");
  await page.locator("#notify-nav").click();
  // Wait for the form to be wired first (see above), then validate.
  await expect(page.locator("#notify-dialog")).toHaveAttribute(
    "data-ready",
    "",
  );
  await page.locator("#notify-email").fill("missing@tld");
  await page.locator("#notify-email-form button[type=submit]").click();
  const hint = page.locator("#notify-status");
  await expect(hint).toContainText("doesn't look right");
  await expect(hint).toBeEmpty({ timeout: 10_000 });
});

test("modal status unfolds the card, then folds away", async ({ page }) => {
  await page.goto("/");
  await page.locator("#notify-nav").click();
  const dialog = page.locator("#notify-dialog");
  await expect(dialog).toHaveAttribute("data-ready", "");
  const wrap = page.locator("#notify-status-wrap");
  await page.locator("#notify-email").fill("missing@tld");
  await page.locator("#notify-email-form button[type=submit]").click();
  const hint = page.locator("#notify-status");
  // The error text expands the card with or without a backend.
  await expect(hint).toContainText("doesn't look right");
  // When expanded, the row has height and the card grows to fit.
  await expect(wrap).toHaveCSS("grid-template-rows", /[1-9]/);
  const mid = await dialog.evaluate((el) => el.getBoundingClientRect().height);
  // After the fade, the text is cleared and the wrapper collapses to zero
  // height.
  await expect(hint).toBeEmpty({ timeout: 10_000 });
  await expect(wrap).toHaveCSS("grid-template-rows", "0px");
  const end = await dialog.evaluate((el) => el.getBoundingClientRect().height);
  expect(end).toBeLessThan(mid);
});

test("selecting status text never closes the modal", async ({ page }) => {
  await page.goto("/");
  // The dev mock handles joins. Without it the submit shows an error. Either
  // way the test keys off the status text below.
  const mock = (await page.request.get("/api/collectors")).status() === 200;
  await page.locator("#notify-nav").click();
  const dialog = page.locator("#notify-dialog");
  await expect(dialog).toBeVisible();
  // Wait for the form to be wired before submitting so it can't race the result.
  const hint = page.locator("#notify-status");
  await expect(dialog).toHaveAttribute("data-ready", "");
  await page.locator("#notify-email").fill(`e2e-${Date.now()}@example.com`);
  await page.locator("#notify-email-form button[type=submit]").click();
  // The dev mock replies with only a confirm link.
  await expect(hint).toContainText(
    mock ? "open the confirm page" : "That didn't work",
  );
  // Drag-select from the text out past the card edge. The click that ends on
  // the dialog itself should not dismiss it. Measure once the status row
  // has finished unfolding, or the drag can start on the card's empty edge.
  await hint.evaluate((el) =>
    Promise.all(
      (el.parentElement ?? el)
        .getAnimations({ subtree: true })
        .map((a) => a.finished),
    ),
  );
  const box = await hint.boundingBox();
  expect(box).not.toBe(null);
  if (box !== null) {
    await page.mouse.move(box.x + 4, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(6, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
  }
  await expect(dialog).toBeVisible();
  // A plain backdrop click still dismisses it, like the × button.
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.mouse.click(6, 6);
  await expect(dialog).toBeHidden();
});

test("tapping status text copies it with a toast", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  const mock = (await page.request.get("/api/collectors")).status() === 200;
  await page.locator("#notify-nav").click();
  const hint = page.locator("#notify-status");
  await expect(page.locator("#notify-dialog")).toHaveAttribute(
    "data-ready",
    "",
  );
  await page.locator("#notify-email").fill(`e2e-${Date.now()}@example.com`);
  await page.locator("#notify-email-form button[type=submit]").click();
  // The dev mock replies with only a confirm link.
  const words = mock ? "open the confirm page" : "That didn't work";
  await expect(hint).toContainText(words);
  // Click the status line, not the link inside it. Clicking the link would
  // follow it instead of copying.
  await hint.evaluate((el) => (el as HTMLElement).click());
  await expect(page.locator("#notify-toast")).toContainText("Copied.");
  const pasted = await page.evaluate(() => navigator.clipboard.readText());
  expect(pasted).toContain(words);
});

test("buyer signup validates, and needs the list set up", async ({
  request,
}) => {
  // With no key and no backend, a valid address gets an error rather than a
  // fake success. The dev mock returns 201 with a link instead.
  const mode = await request.get("/api/collectors");
  const ok = await request.post("/api/collectors", {
    data: { email: "api-fan@example.com" },
  });
  if (mode.status() === 200) {
    expect(ok.status()).toBe(201);
    expect((await ok.json()).devConfirmUrl).toContain("/email/confirmed");
  } else {
    expect(ok.status()).toBe(500);
  }

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
  // Without secrets this returns { unconfigured: true, views: [] }. With a real
  // token in local .env it returns live rows. Either way views is an array.
  expect(Array.isArray(body.views)).toBe(true);
});

test("admin explains itself gracefully without a publishing backend", async ({
  page,
}) => {
  await page.goto("/admin");
  // The dev API has no GitHub, so the built index renders with practice
  // edits merged in. Thumbnails and links work; publishing only works live.
  const rows = page.locator('#edit-list a.row-title[href^="/paintings/"]');
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  expect(await rows.count()).toBeGreaterThan(0);
  await expect(page.locator("#collection-title")).toHaveText("Available");
  await expect(page.locator("#edit-list img.thumb").first()).toBeVisible();
  // Each card has one studio link. Draft titles link to their room.
  await expect(page.locator("#edit-list .row-edit")).toHaveCount(
    await page.locator("#edit-list .row-card").count(),
  );
  await expect(page.locator("#collection-refresh")).toBeHidden();
  await expect(page.locator("#collection-dev")).toContainText(
    "Development only",
  );
  // A normal load shows no toast.
  await expect(page.locator("#admin-status")).toBeHidden();
  // There is no Most-viewed card. View counts appear in the rows, and with no
  // data the rows show no counts and no message.
  await expect(page.locator("#sec-views")).toHaveCount(0);
  await expect(page.locator("#edit-list")).not.toContainText("preview");
});

test("asked-for contrast inks the quiet text", async ({ browser }) => {
  // With prefers-contrast: more, secondary painting text uses full ink
  // instead of the muted tone.
  const context = await browser.newContext({ contrast: "more" });
  const page = await context.newPage();
  await page.goto("/paintings/first-thaw");
  const meta = page.locator(".art-meta").first();
  await expect(meta).toBeVisible();
  await expect
    .poll(async () => meta.evaluate((el) => getComputedStyle(el).color), {
      timeout: 5000,
    })
    .toBe("rgb(35, 32, 27)");
  await context.close();
});

test("public header becomes a bar only once the page scrolls", async ({
  page,
}) => {
  await page.goto("/");
  const header = page.locator(".site-header");
  // Clear over the top of the page.
  await expect(header).not.toHaveAttribute("data-scrolled");
  await expect(header).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  // Partway through the first 80px the bar is partly filled in, so it
  // tracks the scroll instead of playing on a timer.
  await page.evaluate(() => window.scrollTo(0, 40));
  await expect
    .poll(() => header.evaluate((el) => el.style.getPropertyValue("--bar")))
    .toBe("0.500");
  // Past it the bar is fully on.
  await page.evaluate(() => window.scrollTo(0, 600));
  await expect(header).toHaveAttribute("data-scrolled", "");
  await expect
    .poll(() => header.evaluate((el) => el.style.getPropertyValue("--bar")))
    .toBe("1.000");
  await expect
    .poll(() => header.evaluate((el) => getComputedStyle(el).backgroundColor))
    .not.toBe("rgba(0, 0, 0, 0)");
  // Back at the top it clears again.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(header).not.toHaveAttribute("data-scrolled");
  // Studio pages keep their always-on bar.
  await page.goto("/admin");
  await expect(page.locator(".site-header")).not.toHaveAttribute(
    "data-scroll-bar",
  );
});
