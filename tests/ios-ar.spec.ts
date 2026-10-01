import { expect, test } from "@playwright/test";

/**
 * On an iPhone user agent the buyer page hands Quick Look a USDZ file.
 * Headless Chromium can't run Quick Look, so this checks the surrounding
 * setup: the data-usdz attribute, model-viewer's ios-src, quick-look and
 * wall-placement attributes, and a 200 for the USDZ file.
 */

test.use({
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) " +
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 " +
    "Mobile/15E148 Safari/604.1",
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

test("iPhone buyer gets a valid Quick Look USDZ handoff", async ({
  page,
  request,
}) => {
  await page.goto("/paintings/night-reeds");

  const main = page.locator("#main");
  const usdz = (await main.getAttribute("data-usdz")) ?? "";
  expect(usdz, "data-usdz handoff").toMatch(/^\/models\/.+\.usdz$/);

  const res = await request.get(usdz);
  expect(res.status(), `${usdz} serves`).toBe(200);
  expect((await res.body()).length, `${usdz} non-empty`).toBeGreaterThan(0);

  await page.locator("#ar-mount").scrollIntoViewIfNeeded();
  const viewer = page.locator("#ar-stage model-viewer");
  await expect(viewer, "model-viewer builds on scroll").toBeAttached({
    timeout: 20000,
  });
  await expect(viewer).toHaveAttribute("ios-src", usdz);
  await expect(viewer).toHaveAttribute("ar-placement", "wall");
  await expect(viewer).toHaveAttribute("ar-scale", "fixed");
  const modes = (await viewer.getAttribute("ar-modes")) ?? "";
  expect(modes, "quick-look in ar-modes").toContain("quick-look");
});
