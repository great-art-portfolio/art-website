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

test("Android buyer gets Google's viewer first, WebXR behind it", async ({
  page,
}) => {
  await page.goto("/paintings/night-reeds");
  await page.locator("#ar-mount").scrollIntoViewIfNeeded();
  const viewer = page.locator("#ar-stage model-viewer");
  await expect(viewer, "model-viewer builds on scroll").toBeAttached({
    timeout: 20000,
  });
  await expect(viewer).toHaveAttribute(
    "ar-modes",
    "scene-viewer webxr quick-look",
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

test("Android buyer is told when the wall view fails", async ({ page }) => {
  await page.goto("/paintings/night-reeds");
  await page.locator("#ar-mount").scrollIntoViewIfNeeded();
  const viewer = page.locator("#ar-stage model-viewer");
  await expect(viewer).toBeAttached({ timeout: 20000 });
  const status = page.locator("#ar-status");
  await expect(status).not.toHaveClass(/show/);
  await viewer.evaluate((el) =>
    el.dispatchEvent(
      new CustomEvent("ar-status", { detail: { status: "failed" } }),
    ),
  );
  await expect(status).toHaveClass(/show/);
  await expect(status).toHaveText(
    "The wall view didn't open. Please try again.",
  );
});

test("after Google's viewer bounced, later pages label the button for ours", async ({
  page,
}) => {
  // An AR-capable phone, earlier in a visit where Google's viewer bounced.
  await page.addInitScript(() => {
    sessionStorage.setItem("wallAr.googleOut", "1");
    Object.defineProperty(navigator, "xr", {
      value: { isSessionSupported: () => Promise.resolve(true) },
      configurable: true,
    });
  });
  await page.goto("/paintings/night-reeds");
  await page.locator("#ar-mount").scrollIntoViewIfNeeded();
  await expect(page.locator("#ar-stage button.ar-button")).toHaveText(
    "Try again with fallback",
    { timeout: 20000 },
  );
});
