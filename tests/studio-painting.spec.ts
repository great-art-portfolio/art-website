import { expect, test } from "@playwright/test";

/**
 * Studio painting rooms: /admin/paintings/new (draft) and
 * /admin/paintings/[slug] (edit) render the shared buyer layout with
 * editing in place — what she sees is what buyers get.
 */

test("draft room looks like the buyer page, empty and editable", async ({ page }) => {
  await page.goto("/admin/paintings/new");
  await expect(page.locator("#pv-title")).toHaveText("Untitled");
  await expect(page.locator("#pv-price")).toHaveText("Price?");
  await expect(page.locator(".eyebrow")).toHaveText("Draft · only you can see this");
  // Photo tile waits for an upload where the photo goes.
  await expect(page.locator("#de-photo-caption")).toHaveText("Upload photo");
  await expect(page.locator("#de-photo-empty")).toBeVisible();
  // Wall preview holds its honest wait in words.
  await expect(page.locator("#de-ar-waiting")).toContainText("about 5 seconds");
  await expect(page.locator("#de-ar-waiting")).toContainText("view it in AR");
  // Interested is off, with the reason stated.
  const interested = page.locator(".inquiry-off .btn-primary");
  await expect(interested).toBeDisabled();
  await expect(page.locator(".inquiry-off .hint")).toContainText("Off while you edit");
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
  await page.locator("#de-medium").fill("Oil on canvas");
  await page.locator("#de-desc").fill("First paragraph.\n\nSecond paragraph.");
  await expect(page.locator("#pv-title")).toHaveText("Test Thaw");
  await expect(page.locator("#pv-price")).toHaveText("$200.00");
  await expect(page.locator("#pv-meta")).toHaveText("Oil on canvas · 24 × 36 in");
  await expect(page.locator("#pv-desc")).toContainText("First paragraph.");
  await expect(page.locator("#pv-desc")).toContainText("Second paragraph.");
});

test("draft validates before anything uploads", async ({ page }) => {
  await page.goto("/admin/paintings/new");
  await page.locator("#de-publish").click();
  await expect(page.locator("#de-status")).toContainText("Title and a valid price are required.");
  await page.locator("#de-title").fill("No Photo Yet");
  await page.locator("#de-price").fill("50");
  await page.locator("#de-publish").click();
  await expect(page.locator("#de-status")).toContainText("Choose a photo first.");
});

test("draft photo builds its own wall preview", async ({ page }) => {
  await page.goto("/admin/paintings/new");
  await page.locator("#de-photo").setInputFiles("src/content/paintings/1943x1967.jpg");
  await expect(page.locator("#de-photo-preview")).toBeVisible();
  await expect(page.locator("#de-photo-empty")).toBeHidden();
  await expect(page.locator("#de-photo-tools")).toBeVisible();
  // The waiting box steps aside for the real viewer, no button to press.
  const viewer = page.locator("#ar-stage model-viewer");
  await expect(viewer).toBeAttached({ timeout: 30_000 });
  await expect(page.locator("#de-ar-waiting")).toBeHidden();
});

test("edit room arrives prefilled with save, visibility, and delete", async ({ page }) => {
  await page.goto("/admin/paintings/first-thaw");
  await expect(page.locator("#de-title")).toHaveValue("First Thaw");
  await expect(page.locator("#pv-title")).toHaveText("First Thaw");
  await expect(page.locator("#pv-price")).toContainText("$125.00");
  await expect(page.locator("#de-save")).toHaveText("Save changes");
  await expect(page.locator("#de-del")).toHaveText("Delete…");
  await expect(page.locator("#de-replace")).toHaveText("Replace photo");
  await expect(page.locator(".crumbs a")).toHaveAttribute("href", "/admin");
  // Live preview follows edits.
  await page.locator("#de-price").fill("175");
  await expect(page.locator("#pv-price")).toContainText("$175.00");
});

test("edit room validates before saving", async ({ page }) => {
  await page.goto("/admin/paintings/first-thaw");
  await expect(page.locator("#main")).toHaveAttribute("data-studio-wired", /edit/);
  await page.locator("#de-title").fill("");
  await page.locator("#de-save").click();
  await expect(page.locator("#de-status")).toContainText("Title and a valid price are required.");
});

test("delete arms before firing, never on one tap", async ({ page }) => {
  await page.goto("/admin/paintings/first-thaw");
  await expect(page.locator("#main")).toHaveAttribute("data-studio-wired", /edit/);
  const del = page.locator("#de-del");
  await del.click();
  await expect(del).toHaveText("Tap again to delete");
  await expect(page.locator("#de-status")).toContainText("Tap again to confirm");
  // Still in the room — nothing deleted, nowhere navigated.
  await expect(page).toHaveURL(/\/admin\/paintings\/first-thaw/);
});
