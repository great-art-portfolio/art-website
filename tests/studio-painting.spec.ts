import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * Studio painting rooms: /admin/paintings/new (draft) and
 * /admin/paintings/[slug] (edit) render the shared buyer layout with
 * editing in place — what she sees is what buyers get.
 */

test("draft room looks like the buyer page, empty and editable", async ({
  page,
}) => {
  await page.goto("/admin/paintings/new");
  await expect(page.locator("#pv-title")).toHaveText("Untitled");
  await expect(page.locator("#pv-price")).toHaveText("Price?");
  await expect(page.locator(".eyebrow")).toHaveText(
    "Draft · only you can see this",
  );
  // Photo tile waits for an upload where the photo goes — the tile
  // itself says so, photos only.
  await expect(page.locator("#de-photo-empty")).toHaveText("Upload photo");
  await expect(page.locator("#de-photo-caption")).toHaveCount(0);
  // Wall preview holds its honest wait in words, under the tile.
  await expect(page.locator("#de-ar-waiting")).toContainText("about 5 seconds");
  await expect(page.locator("#de-ar-waiting")).toContainText("view it in AR");
  // No Interested button here — a draft has no live page yet.
  await expect(page.locator(".inquiry-off")).toHaveCount(0);
  // Alt text says who it's for, in plain words — a separate caption
  // under the field, so hovering it never touches the input.
  await expect(page.locator("#de-alt-hint")).toContainText(
    "It never shows on the page.",
  );
  // The wall wait names the 3D model, not just "the 3D".
  await expect(page.locator("#de-ar-waiting")).toContainText("3D model takes");
  // Narrow centered measure on desktop — it wraps instead of sprawling.
  const mountW = (await page.locator("#ar-mount").boundingBox())?.width ?? 0;
  const waitW =
    (await page.locator("#de-ar-waiting").boundingBox())?.width ?? 0;
  expect(waitW).toBeGreaterThan(0);
  expect(waitW).toBeLessThan(mountW);
  await expect(page.locator("#de-alt")).toHaveAttribute(
    "aria-describedby",
    "de-alt-hint",
  );
  // Wall preview is plainly named, under the tile.
  await expect(page.locator("#ar-mount h2")).toHaveText("3D Model Preview");
  // Sold rides beside the save buttons, not above them.
  await expect(
    page.locator(".studio-toolbar .de-check:has(#de-sold)"),
  ).toContainText("Sold");
  // Both exits for a new painting, and the way back.
  await expect(page.locator("#de-save-draft")).toHaveText("Save draft");
  await expect(page.locator("#de-publish")).toHaveText("Publish painting");
  await expect(page.locator(".crumbs a")).toHaveAttribute("href", "/admin");
});

test("typing in the draft updates the buyer preview live", async ({ page }) => {
  await page.goto("/admin/paintings/new");
  await page.locator("#de-title").fill("Test Thaw");
  await page.locator("#de-price").fill("200");
  await page.locator("#de-w").fill("24");
  await page.locator("#de-h").fill("36");
  await page.locator("#de-d").fill("1");
  await page.locator("#de-medium").fill("Oil on canvas");
  await page.locator("#de-alt").fill("Blue waves");
  await page.locator("#de-desc").fill("First paragraph.\n\nSecond paragraph.");
  await expect(page.locator("#pv-title")).toHaveText("Test Thaw");
  await expect(page.locator("#pv-price")).toHaveText("$200.00");
  await expect(page.locator("#pv-meta")).toHaveText(
    "Oil on canvas · 24 × 36 × 1 in",
  );
  await expect(page.locator("#pv-desc")).toContainText("First paragraph.");
  await expect(page.locator("#pv-desc")).toContainText("Second paragraph.");
});

test("draft rooms offer publish alerts, unchecked by default", async ({
  page,
}) => {
  await page.goto("/admin/paintings/new");
  await expect(page.locator("#de-notify-push")).toBeVisible();
  await expect(page.locator("#de-notify-email")).toBeVisible();
  await expect(page.locator("#de-notify-push")).not.toBeChecked();
  await expect(page.locator("#de-notify-email")).not.toBeChecked();
});

test("published rooms offer no alerts", async ({ page }) => {
  await page.goto("/admin/paintings/first-thaw");
  await expect(page.locator("#de-notify-push")).toHaveCount(0);
  await expect(page.locator("#de-notify-email")).toHaveCount(0);
});

test("publishing a draft fires only the checked channels", async ({
  browser,
}) => {
  const authed = await browser.newContext();
  await authed.addInitScript(() =>
    sessionStorage.setItem("ADMIN_API_TOKEN", "test"),
  );
  const page = await authed.newPage();
  let postedNotify: { push?: boolean; email?: boolean } | null = null;
  const draftMd = readFileSync("src/content/paintings/3.md", "utf8");
  await page.route("**/api/commit*", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      await route.fulfill({ json: { ok: true }, status: 201 });
    } else if (req.method() === "GET" && req.url().includes("path=")) {
      await route.fulfill({ json: { content: draftMd } });
    } else {
      await route.continue();
    }
  });
  await page.route("**/api/notify", async (route) => {
    postedNotify = route.request().postDataJSON();
    await route.fulfill({
      json: { sent: 1, total: 1, emailed: false, emailTotal: 0 },
    });
  });
  await page.goto("/admin/paintings/3");
  await expect(page.locator("#de-visibility")).toHaveText("Publish");
  await page.locator("#de-notify-push").check();
  await page.locator("#de-visibility").click();
  await expect.poll(() => postedNotify).toEqual({ push: true, email: false });
  await expect(page).toHaveURL(/\/admin\/?$/);
  await authed.close();
});

test("draft validates before anything uploads", async ({ page }) => {
  await page.goto("/admin/paintings/new");
  await page.locator("#de-publish").click();
  await expect(page.locator("#de-status")).toContainText(
    "Title and a valid price are required.",
  );
  await page.locator("#de-title").fill("No Photo Yet");
  await page.locator("#de-price").fill("50");
  await page.locator("#de-publish").click();
  await expect(page.locator("#de-status")).toContainText(
    "Choose a photo first.",
  );
});

test("draft photo builds its own wall preview", async ({ page }) => {
  await page.goto("/admin/paintings/new");
  await page
    .locator("#de-photo")
    .setInputFiles("src/content/paintings/1943x1967.jpg");
  await expect(page.locator("#de-photo-preview")).toBeVisible();
  await expect(page.locator("#de-photo-empty")).toBeHidden();
  await expect(page.locator("#de-photo-tools")).toBeVisible();
  // The waiting box steps aside for the real viewer, no button to press.
  const viewer = page.locator("#ar-stage model-viewer");
  await expect(viewer).toBeAttached({ timeout: 30_000 });
  await expect(page.locator("#de-ar-waiting")).toBeHidden();
});

test("edit room arrives prefilled with save, visibility, and delete", async ({
  page,
}) => {
  await page.goto("/admin/paintings/first-thaw");
  await expect(page.locator("#de-title")).toHaveValue("First Thaw");
  await expect(page.locator("#pv-title")).toHaveText("First Thaw");
  await expect(page.locator("#pv-price")).toContainText("$125.00");
  await expect(page.locator("#de-save")).toHaveText("Save changes");
  await expect(page.locator("#de-del")).toHaveText("Delete");
  // Sold is a custom studio checkbox, not the browser default.
  await expect(page.locator("#de-sold")).toHaveCSS("appearance", "none");
  await expect(page.locator("#de-sold")).toHaveCSS("cursor", "pointer");
  await expect(page.locator("#de-replace")).toHaveText("Replace photo");
  // No Interested button anywhere in the studio — just a note saying
  // buyers still get one on the live page. Drafts hide even that.
  await expect(page.locator(".inquiry-off button")).toHaveCount(0);
  await expect(page.locator(".inquiry-off .hint")).toContainText(
    "off while you edit",
  );
  await expect(page.locator(".crumbs a")).toHaveAttribute("href", "/admin");
  // Live preview follows edits.
  await page.locator("#de-price").fill("175");
  await expect(page.locator("#pv-price")).toContainText("$175.00");
});

test("edit room validates before saving", async ({ page }) => {
  await page.goto("/admin/paintings/first-thaw");
  await expect(page.locator("#main")).toHaveAttribute(
    "data-studio-wired",
    /edit/,
  );
  await page.locator("#de-title").fill("");
  await expect(page.locator("#de-desc")).toHaveValue(/^\S/);
  await page.locator("#de-save").click();
  await expect(page.locator("#de-status")).toContainText(
    "Title and a valid price are required.",
    { timeout: 10_000 },
  );
  // Toast words fade in, not snap — and room errors pin to the top.
  await expect(page.locator("#de-status")).toHaveClass(/toast-in/);
  const pos = await page.locator("#de-status").evaluate((el) => {
    const s = getComputedStyle(el);
    return { position: s.position, top: s.top, bottom: s.bottom };
  });
  expect(pos.position).toBe("fixed");
  // Below the sticky header, not behind it. (Chrome reports bottom as a
  // used pixel value once top pins a fixed box, so top carries the claim.)
  const top = Number.parseFloat(pos.top);
  expect(top).toBeGreaterThan(60);
  expect(top).toBeLessThan(200);
});

test("preview title and price open their fields", async ({ page }) => {
  await page.goto("/admin/paintings/new");
  // Same look, doors: no input styling on the preview text.
  await expect(page.locator("#pv-title")).toHaveCSS("cursor", "text");
  await expect(page.locator("#pv-price")).toHaveCSS("cursor", "text");
  await page.locator("#pv-title").click();
  await expect(page.locator("#de-title")).toBeFocused();
  await page.locator("#pv-price").click();
  await expect(page.locator("#de-price")).toBeFocused();
  // Keyboard too: Enter on the preview lands in the field.
  await page.locator("#pv-title").press("Enter");
  await expect(page.locator("#de-title")).toBeFocused();
});

test("secondary actions fade their hovers", async ({ page }) => {
  await page.goto("/admin/paintings/new");
  const pub = await page
    .locator("#de-publish")
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(pub).toContain("0.25s");
  // Hovering the Sold word lights its box — easing in, not snapping.
  const soldTransition = await page
    .locator("#de-sold")
    .evaluate((el) => getComputedStyle(el).transition);
  expect(soldTransition).toContain("border-color");
  expect(soldTransition).toContain("0.2s");
  await page.locator(".de-check:has(#de-sold)").hover();
  await expect(page.locator("#de-sold")).toHaveCSS(
    "border-color",
    "rgb(164, 74, 36)",
  );
});

test("label text never warms its field", async ({ page }) => {
  await page.goto("/admin/paintings/new");
  // Hover the "Title" words themselves, not the box. Text fields carry
  // no hover tint at all (label hover forwards to the field, so a tint
  // could never tell the two apart) — the border stays the line color.
  await page
    .locator(".studio-fields label")
    .first()
    .hover({ position: { x: 10, y: 8 } });
  await expect(page.locator("#de-title")).toHaveCSS(
    "border-color",
    "rgb(229, 220, 203)",
  );
});

test("reduced motion still fades field colors", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/admin/paintings/new");
  // Movement goes instant; color fades keep running.
  const dur = await page
    .locator("#de-title")
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(dur).toContain("0.2s");
});

test("reduced motion keeps the save button planted", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/admin/paintings/new");
  await page.locator("#de-save-draft").hover();
  await expect(page.locator("#de-save-draft")).toHaveCSS("transform", "none");
});

test("delete asks in a modal, never on one tap", async ({ page }) => {
  await page.goto("/admin/paintings/first-thaw");
  await expect(page.locator("#main")).toHaveAttribute(
    "data-studio-wired",
    /edit/,
  );
  // The room says what it is, in words.
  await expect(page.locator(".eyebrow")).toHaveText(
    "EDITING · ONLY YOU CAN SEE THIS",
  );
  const del = page.locator("#de-del");
  const modal = page.locator("#de-confirm");
  const yes = page.locator("#de-confirm-yes");
  await del.click();
  await expect(modal).toBeVisible();
  await expect(page.locator("#de-confirm-body")).toContainText("recoverable");
  // DELETE starts disabled with a countdown — one tap fires nothing, and
  // the room button never changes its meaning.
  await expect(yes).toBeDisabled();
  await expect(yes).toHaveText(/Delete \(\d\)/);
  await expect(del).toHaveText("Delete");
  await expect(page).toHaveURL(/\/admin\/paintings\/first-thaw/);
  // "Keep it" backs out; Escape does too.
  await page.locator("#de-confirm-no").click();
  await expect(modal).toBeHidden();
  await del.click();
  await expect(modal).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  // After 3.5 seconds of reading time the button arms for real.
  await del.click();
  await expect(yes).toBeEnabled({ timeout: 8000 });
  await expect(yes).toHaveText("Delete");
});

test("edit room replace swaps the framed photo", async ({ page }) => {
  await page.goto("/admin/paintings/first-thaw");
  await expect(page.locator("#main")).toHaveAttribute(
    "data-studio-wired",
    /edit/,
  );
  const frame = page.locator("#photo-wrap img");
  const before = await frame.getAttribute("src");
  expect(before === null || !before.startsWith("blob:")).toBe(true);
  await page
    .locator("#de-replace-file")
    .setInputFiles("src/content/paintings/2122x2118.jpg");
  // The frame shows the new upload (blob) — a bare src swap would leave
  // the old srcset candidate on screen, so both go.
  await expect(frame).toHaveAttribute("src", /^blob:/);
  await expect(frame).not.toHaveAttribute("srcset", /./);
});
