import { expect, test } from "@playwright/test";

/** The painting hangs at true size in the rendered living room. */
test("a painting hangs at true size in the room view", async ({ page }) => {
  await page.goto("/paintings/night-reeds");
  const room = page.locator("#room-view");
  await room.scrollIntoViewIfNeeded();
  await expect(room.locator("h2")).toHaveText("In a room");
  const art = room.locator(".room-art img");
  await expect(art).toHaveAttribute("alt", /Night Reeds above a sofa/);
  // Both pictures load.
  await expect
    .poll(() =>
      room
        .locator("img")
        .evaluateAll((imgs) =>
          imgs.every(
            (i) => i instanceof HTMLImageElement && i.naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  // 12 in across, at the render's 406.5 px a metre on a 2000 px room.
  const share = await room.evaluate((el) => {
    const stage = el.querySelector(".room-stage")?.getBoundingClientRect();
    const box = el.querySelector(".room-art")?.getBoundingClientRect();
    return stage && box ? box.width / stage.width : 0;
  });
  expect(share).toBeCloseTo((12 * 0.0254 * 406.504) / 2000, 3);
  await expect(room).toContainText("True size, above a 71-inch sofa.");
});
