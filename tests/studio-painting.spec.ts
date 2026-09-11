import { expect, test } from "@playwright/test";

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
  // Publish asks first, Save draft keeps — the ask comes first.
  const exits = await page
    .locator(".studio-toolbar button")
    .evaluateAll((els) => els.map((el) => el.id));
  expect(exits).toEqual(["de-publish", "de-save-draft"]);
  await expect(page.locator(".crumbs a")).toHaveAttribute("href", "/admin");
});

test("a stale autosave never overrides the file", async ({ page }) => {
  await page.goto("/admin/paintings/prairie-moon");
  await expect(page.locator("#de-sold")).toBeChecked();
  // Yesterday's backup says unsold — the file says sold, so the file
  // wins and the stale entry goes away.
  await page.evaluate(() => {
    const main = document.getElementById("main");
    const key = `studio-autosave-v1|edit|${main?.dataset.slug}|${main?.dataset.mdPath}`;
    window.localStorage.setItem(
      key,
      JSON.stringify({ sold: false, savedAt: Date.now() - 25 * 3600 * 1000 }),
    );
  });
  await page.reload();
  await expect(page.locator("#de-sold")).toBeChecked();
  const leftover = await page.evaluate(() =>
    Object.keys(window.localStorage).filter((k) =>
      k.startsWith("studio-autosave-v1|"),
    ),
  );
  expect(leftover).toEqual([]);
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
  // The new-painting room (always built, unlike per-painting rooms that
  // need their file in the tree) — a clean checkout has no draft
  // fixtures, so nothing here may name one.
  const authed = await browser.newContext();
  await authed.addInitScript(() =>
    sessionStorage.setItem("ADMIN_API_TOKEN", "test"),
  );
  const page = await authed.newPage();
  let postedNotify: { push?: boolean; email?: boolean } | null = null;
  let postedMessage: string | null = null;
  await page.route("**/api/commit*", async (route) => {
    if (route.request().method() === "POST") {
      postedMessage =
        (route.request().postDataJSON() as { message?: string } | null)
          ?.message ?? null;
      await route.fulfill({ json: { ok: true, commit: "test" }, status: 201 });
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
  await page.goto("/admin/paintings/new");
  await page.locator("#de-title").fill("Channel Check");
  await page.locator("#de-price").fill("50");
  await page
    .locator("#de-photo")
    .setInputFiles("src/content/paintings/1943x1967.jpg");
  await page.locator("#de-notify-push").check();
  page.on("dialog", async (dialog) => {
    expect(dialog.message()).toContain('Publish "Channel Check" now?');
    await dialog.accept();
  });
  await page.locator("#de-publish").click();
  // Only Browsers was checked — the email list hears nothing.
  await expect
    .poll(() => postedNotify, { timeout: 15_000 })
    .toEqual({ push: true, email: false });
  expect(postedMessage).toBe("Add painting: Channel Check");
  await expect(page).toHaveURL(/\/admin\/?$/, { timeout: 25_000 });
  await authed.close();
});

test("dismissing the publish ask keeps the draft", async ({ browser }) => {
  const authed = await browser.newContext();
  await authed.addInitScript(() =>
    sessionStorage.setItem("ADMIN_API_TOKEN", "test"),
  );
  const page = await authed.newPage();
  let commits = 0;
  await page.route("**/api/commit*", async (route) => {
    if (route.request().method() === "POST") {
      commits += 1;
      await route.fulfill({ json: { ok: true, commit: "test" }, status: 201 });
    } else {
      await route.continue();
    }
  });
  await page.goto("/admin/paintings/new");
  await page.locator("#de-title").fill("Second Thoughts");
  await page.locator("#de-price").fill("60");
  await page
    .locator("#de-photo")
    .setInputFiles("src/content/paintings/1943x1967.jpg");
  page.on("dialog", async (dialog) => {
    await dialog.dismiss();
  });
  await page.locator("#de-publish").click();
  await page.waitForTimeout(1000);
  expect(commits).toBe(0);
  await expect(page).toHaveURL(/\/admin\/paintings\/new/);
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

test("draft refuses a title another painting owns", async ({ browser }) => {
  // Stored token means the live path; the listing names one existing
  // painting, and the commit route records whether anything posted.
  const authed = await browser.newContext();
  await authed.addInitScript(() =>
    sessionStorage.setItem("ADMIN_API_TOKEN", "test"),
  );
  const page = await authed.newPage();
  let posted = false;
  await page.route("**/api/commit*", async (route) => {
    const req = route.request();
    if (req.method() === "PUT") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ files: ["first-thaw.md"] }),
      });
    } else if (req.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          content: '---\ntitle: "First Thaw"\nprice: 125.00\n---\n\nBody',
        }),
      });
    } else if (req.method() === "POST") {
      posted = true;
      await route.fulfill({
        json: { ok: true, commit: "test" },
        status: 201,
      });
    } else {
      await route.continue();
    }
  });
  await page.goto("/admin/paintings/new");
  await page.locator("#de-title").fill("First Thaw");
  await page.locator("#de-price").fill("50");
  await page
    .locator("#de-photo")
    .setInputFiles("src/content/paintings/1943x1967.jpg");
  await expect(page.locator("#de-photo-preview")).toBeVisible();
  await page.locator("#de-save-draft").click();
  // Each title owns its page link, so the save stops here in plain
  // words — and nothing reaches the repo.
  await expect(page.locator("#de-status")).toContainText(
    'Another painting is already called "First Thaw"',
    { timeout: 15_000 },
  );
  expect(posted).toBe(false);
  await authed.close();
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

test("dimension typing shares one rebuild, never one per keystroke", async ({
  page,
}) => {
  await page.goto("/admin/paintings/new");
  await page
    .locator("#de-photo")
    .setInputFiles("src/content/paintings/1943x1967.jpg");
  const viewer = page.locator("#ar-stage model-viewer");
  await expect(viewer).toBeAttached({ timeout: 30_000 });
  // Typing a width must not yank the finished viewer that same instant —
  // keystrokes share one rebuild after a short idle. Pinned to this exact
  // node: a locator would re-find its replacement and hide the yank.
  const node = await viewer.elementHandle();
  expect(node !== null).toBe(true);
  const srcBefore = await viewer.getAttribute("src");
  await page.locator("#de-w").fill("20");
  expect(await node?.evaluate((el) => el.isConnected)).toBe(true);
  // …and the shared rebuild still lands once she pauses (fresh model URL).
  await expect
    .poll(
      async () => page.locator("#ar-stage model-viewer").getAttribute("src"),
      { timeout: 30_000 },
    )
    .not.toBe(srcBefore);
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
    /164, 74, 36|0\.622 0\.289 0\.133/,
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
  await expect(page.locator("#de-confirm-body")).toContainText("trash");
  // MOVE TO TRASH starts disabled with a countdown — one tap fires
  // nothing, and the room button never changes its meaning.
  await expect(yes).toBeDisabled();
  await expect(yes).toHaveText(/Move to trash \(\d\)/);
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
  await expect(yes).toHaveText("Move to trash");
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

test("edit rooms link out to the buyer-view preview", async ({ page }) => {
  await page.goto("/admin/paintings/first-thaw");
  const preview = page.locator("#de-preview");
  await expect(preview).toHaveText("Preview");
  await expect(preview).toHaveAttribute("href", "/admin/preview/first-thaw");
  await expect(preview).toHaveAttribute("target", "_blank");
});

test("preview shows the buyer page with the inquiry switched off", async ({
  page,
}) => {
  await page.goto("/admin/preview/first-thaw");
  await expect(page.locator(".preview-banner")).toContainText(
    "this is what buyers see",
  );
  await expect(page.locator(".preview-banner a")).toHaveAttribute(
    "href",
    "/admin/paintings/first-thaw",
  );
  await expect(page.locator("h1")).toHaveText("First Thaw");
  // No working inquiry on a preview — just the plain-words note.
  await expect(page.locator("#inquiry-form")).toHaveCount(0);
  await expect(page.locator(".inquiry-off .hint")).toContainText(
    "nothing to press in a preview",
  );
  // Never indexed.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex",
  );
});

test("buyer pages canonicalize to the title slug", async ({ page }) => {
  await page.goto("/paintings/first-thaw");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "/paintings/first-thaw",
  );
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});

test("rooms offer a go-live date, empty unless scheduled", async ({ page }) => {
  await page.goto("/admin/paintings/new");
  const when = page.locator("#de-publish-on");
  await expect(when).toHaveAttribute("type", "date");
  await expect(when).toHaveValue("");
  await expect(page.locator("#de-publish-on-hint")).toContainText(
    "Leaving no date will publish right now, after your confirmation.",
  );
  await page.goto("/admin/paintings/first-thaw");
  await expect(page.locator("#de-publish-on")).toHaveValue("");
});

test("typing swaps the preview instantly, never flashing", async ({ page }) => {
  await page.goto("/admin/paintings/new");
  await page.locator("#de-title").fill("Half-typed thaw");
  await expect(page.locator("#pv-title")).toHaveText("Half-typed thaw");
  // No pulse on any preview field — a fade per keystroke reads as
  // flashing while she types.
  const pulses = await page.evaluate(() =>
    ["#pv-title", "#pv-price", "#pv-meta", "#pv-desc"].map(
      (sel) => document.querySelector(sel)?.getAnimations().length ?? -1,
    ),
  );
  expect(pulses).toEqual([0, 0, 0, 0]);
});

test("unsaved typing survives a refresh, silently", async ({ page }) => {
  await page.goto("/admin/paintings/new");
  await page.locator("#de-title").fill("Half-typed thaw");
  // Autosave debounce is under a second; the backup lands with no toast.
  await expect(page.locator("#de-status")).toBeEmpty();
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.locator("#de-title")).toHaveValue("Half-typed thaw");
  await expect(page.locator("#pv-title")).toHaveText("Half-typed thaw");
  await expect(page.locator("#de-status")).toBeEmpty();
});

test("description box grows with its words, never scrolls", async ({
  page,
}) => {
  await page.goto("/admin/paintings/new");
  const desc = page.locator("#de-desc");
  await expect(desc).toBeVisible();
  const empty = (await desc.boundingBox())?.height ?? 0;
  // Six lines in: the box grows instead of scrolling.
  await desc.fill(
    ["One.", "Two.", "Three.", "Four.", "Five.", "Six."].join("\n"),
  );
  await expect
    .poll(async () => (await desc.boundingBox())?.height ?? 0, {
      timeout: 5000,
    })
    .toBeGreaterThan(empty + 40);
  // Growth, not a scrollbar: everything typed stays visible.
  expect(
    await desc.evaluate((el) => el.scrollHeight - el.clientHeight),
  ).toBeLessThanOrEqual(2);
});

test("draft save carries its publish-on date", async ({ browser }) => {
  // Stored token means the live path; the commit route captures the
  // file instead of writing the repo, so nothing persists and nothing
  // needs deleting after.
  const authed = await browser.newContext();
  await authed.addInitScript(() =>
    sessionStorage.setItem("ADMIN_API_TOKEN", "test"),
  );
  const page = await authed.newPage();
  let posted: Array<{ path: string; contentBase64: string }> | null = null;
  // Reads go through the closure: assigning the untyped post body
  // inside the route narrows direct reads to never.
  const sent = (): typeof posted => posted;
  await page.route("**/api/commit*", async (route) => {
    if (route.request().method() === "POST") {
      posted =
        (
          route.request().postDataJSON() as {
            files?: Array<{ path: string; contentBase64: string }>;
          } | null
        )?.files ?? null;
      await route.fulfill({ json: { ok: true, commit: "test" }, status: 201 });
    } else {
      await route.continue();
    }
  });
  await page.goto("/admin/paintings/new");
  // Sold sits right of the publish-on date, both before the buttons.
  const order = await page
    .locator(".studio-toolbar .de-check")
    .evaluateAll((els) =>
      els.map((el) => el.querySelector("input")?.id ?? "?"),
    );
  expect(order.slice(0, 2)).toEqual(["de-publish-on", "de-sold"]);
  await page.locator("#de-title").fill("Future Thaw");
  await page.locator("#de-price").fill("75");
  await page
    .locator("#de-photo")
    .setInputFiles("src/content/paintings/1943x1967.jpg");
  await page.locator("#de-publish-on").fill("2999-06-01");
  await page.locator("#de-save-draft").click();
  await expect.poll(() => posted, { timeout: 15_000 }).not.toBe(null);
  const md = Buffer.from(
    sent()?.find((f) => f.path.endsWith(".md"))?.contentBase64 ?? "",
    "base64",
  ).toString("utf8");
  expect(md).toMatch(/^draft: true$/m);
  expect(md).toMatch(/^publishOn: "2999-06-01"$/m);
  await authed.close();
});
