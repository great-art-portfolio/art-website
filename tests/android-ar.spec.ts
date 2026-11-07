import { expect, test } from "@playwright/test";

/**
 * On Android the wall preview tries in-browser WebXR before Scene Viewer,
 * which the Google app closes on open since its fall 2026 updates.
 */

test.use({
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; SM-S921W) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

test("Android buyer gets WebXR before Scene Viewer", async ({ page }) => {
  await page.goto("/paintings/night-reeds");
  await page.locator("#ar-mount").scrollIntoViewIfNeeded();
  const viewer = page.locator("#ar-stage model-viewer");
  await expect(viewer, "model-viewer builds on scroll").toBeAttached({
    timeout: 20000,
  });
  await expect(viewer).toHaveAttribute(
    "ar-modes",
    "webxr scene-viewer quick-look",
  );
  await expect(viewer).toHaveAttribute("ar-placement", "wall");
  // three.js would pick WebXR Layers, which Kiwi lists but can't run.
  const layers = await page.evaluate(() =>
    typeof XRWebGLBinding === "undefined"
      ? "no binding"
      : "createProjectionLayer" in XRWebGLBinding.prototype,
  );
  expect(layers, "projection layers hidden").not.toBe(true);
});
