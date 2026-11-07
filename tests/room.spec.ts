import { expect, test } from "@playwright/test";

/** The painting hangs at true size in the rendered living room. */
test("a painting hangs at true size in the room view", async ({ page }) => {
  await page.goto("/paintings/night-reeds");
  const room = page.locator("#room-view");
  const photo = page.locator("#photo-wrap");
  const toggle = page.locator("#room-toggle");
  // The painting first; the room is one tap away, on the size line.
  await expect(room).toBeHidden();
  await expect(toggle).toHaveText("See it in a room");
  const before = await photo.boundingBox();
  await toggle.click();
  await expect(room).toBeVisible();
  await expect(photo).toHaveClass(/in-room/);
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toHaveText("Show the painting");
  // The room fills the photo's own frame: its size doesn't change, so
  // nothing below it moves. (The tap may scroll the page.)
  const after = await photo.boundingBox();
  expect(after?.width).toBeCloseTo(before?.width ?? 0, 1);
  expect(after?.height).toBeCloseTo(before?.height ?? 0, 1);
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
  await expect(room).toContainText("True size");
  // And back to the painting.
  await toggle.click();
  await expect(room).toBeHidden();
  await expect(photo).not.toHaveClass(/in-room/);
});
