import { expect, test } from "@playwright/test";

/**
 * Studio painting rooms. /admin/paintings/new (draft) and
 * /admin/paintings/[slug] (edit) render the buyer layout with in-place
 * editing, so the studio matches what buyers see.
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
  // The photo tile prompts for an upload and has no caption.
  await expect(page.locator("#de-photo-empty")).toHaveText("Upload photo");
  await expect(page.locator("#de-photo-caption")).toHaveCount(0);
  // The wall preview explains the wait in text below the tile.
  await expect(page.locator("#de-ar-waiting")).toContainText("about 5 seconds");
  await expect(page.locator("#de-ar-waiting")).toContainText("view it in AR");
  // A draft has no live page, so there is no inquiry form.
  await expect(page.locator("#inquiry-form")).toHaveCount(0);
  // The alt text hint is a separate caption under the field, so hovering
  // it doesn't affect the input.
  await expect(page.locator("#de-alt-hint")).toContainText(
    "It never shows on the page.",
  );
  await expect(page.locator("#de-alt-hint")).toContainText(
    "Alt text describes",
  );
  await expect(page.locator("#de-ar-waiting")).toContainText("3D model takes");
  // On desktop the wait text is narrower than the mount so it wraps.
  const mountW = (await page.locator("#ar-mount").boundingBox())?.width ?? 0;
  const waitW =
    (await page.locator("#de-ar-waiting").boundingBox())?.width ?? 0;
  expect(waitW).toBeGreaterThan(0);
  expect(waitW).toBeLessThan(mountW);
  await expect(page.locator("#de-alt")).toHaveAttribute(
    "aria-describedby",
    "de-alt-hint",
  );
  await expect(page.locator("#ar-mount h2")).toHaveText("3D Model Preview");
  // The Sold checkbox sits in the toolbar beside the save buttons.
  await expect(
    page.locator(".studio-toolbar .de-check:has(#de-sold)"),
  ).toContainText("Sold");
  await expect(page.locator("#de-save-draft")).toHaveText("Save draft");
  await expect(page.locator("#de-publish")).toHaveText("Publish painting");
  // Publish comes before Save draft.
  const exits = await page
    .locator(".studio-toolbar button")
    .evaluateAll((els) => els.map((el) => el.id));
  expect(exits).toEqual(["de-publish", "de-save-draft"]);
  await expect(page.locator(".crumbs a")).toHaveAttribute("href", "/admin");
});

test("a stale autosave never overrides the file", async ({ page }) => {
  // Uses the title rather than the sold flag, so no fixture has to be sold.
  await page.goto("/admin/paintings/first-thaw");
  await expect(page.locator("#de-title")).toHaveValue("First Thaw");
  // Plant an older backup with a different title. The file says First Thaw,
  // so the file wins and the stale backup is discarded.
  await page.evaluate(() => {
    const main = document.getElementById("main");
    const key = `studio-autosave-v1|edit|${main?.dataset.slug}|${main?.dataset.mdPath}`;
    window.localStorage.setItem(
      key,
      JSON.stringify({
        title: "Stale Title",
        savedAt: Date.now() - 25 * 3600 * 1000,
      }),
    );
  });
  await page.reload();
  await expect(page.locator("#de-title")).toHaveValue("First Thaw");
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
  // Use the new-painting room, which is always built. Per-painting rooms
  // need their file in the tree, and a clean checkout has no draft fixtures.
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
  // Only Browsers was checked, so nothing goes to the email list.
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
  // A stored token selects the live path. The listing returns one existing
  // painting, and the commit route records whether anything was posted.
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
  // Titles determine page links, so a duplicate title stops the save with
  // an error and nothing is committed.
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
  // The waiting box is replaced by the viewer automatically.
  const viewer = page.locator("#ar-stage model-viewer");
  await expect(viewer).toBeAttached({ timeout: 30_000 });
  await expect(viewer).toHaveAttribute("touch-action", "pan-y");
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
  // Typing a width shouldn't replace the viewer immediately; keystrokes are
  // debounced into one rebuild. Hold this exact node, since a locator would
  // find the replacement and hide the problem.
  const node = await viewer.elementHandle();
  expect(node !== null).toBe(true);
  const srcBefore = await viewer.getAttribute("src");
  await page.locator("#de-w").fill("20");
  expect(await node?.evaluate((el) => el.isConnected)).toBe(true);
  // The rebuild still happens after typing stops, with a new model URL.
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
  // Sold uses the custom studio checkbox, not the browser default.
  await expect(page.locator("#de-sold")).toHaveCSS("appearance", "none");
  await expect(page.locator("#de-sold")).toHaveCSS("cursor", "pointer");
  await expect(page.locator("#de-replace")).toHaveText("Replace photo");
  // The studio has no inquiry form.
  await expect(page.locator("#inquiry-form")).toHaveCount(0);
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
  // Toast text fades in, and room errors are pinned to the top.
  await expect(page.locator("#de-status")).toHaveClass(/toast-in/);
  const pos = await page.locator("#de-status").evaluate((el) => {
    const s = getComputedStyle(el);
    return { position: s.position, top: s.top, bottom: s.bottom };
  });
  expect(pos.position).toBe("fixed");
  // The toast sits below the sticky header. Chrome reports bottom as a used
  // pixel value once top is set on a fixed box, so check top instead.
  const top = Number.parseFloat(pos.top);
  expect(top).toBeGreaterThan(60);
  expect(top).toBeLessThan(200);
});

test("preview title and price open their fields", async ({ page }) => {
  await page.goto("/admin/paintings/new");
  // The preview text has no input styling, only a text cursor.
  await expect(page.locator("#pv-title")).toHaveCSS("cursor", "text");
  await expect(page.locator("#pv-price")).toHaveCSS("cursor", "text");
  await page.locator("#pv-title").click();
  await expect(page.locator("#de-title")).toBeFocused();
  await page.locator("#pv-price").click();
  await expect(page.locator("#de-price")).toBeFocused();
  // Enter on the preview text also focuses the field.
  await page.locator("#pv-title").press("Enter");
  await expect(page.locator("#de-title")).toBeFocused();
});

test("secondary actions fade their hovers", async ({ page }) => {
  await page.goto("/admin/paintings/new");
  const pub = await page
    .locator("#de-publish")
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(pub).toContain("0.25s");
  // Hovering the Sold label highlights its box with a transition.
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
  // Hover the "Title" label, not the box. Text fields have no hover tint,
  // because label hover is forwarded to the field and the two couldn't be
  // distinguished. The border keeps the line color.
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
  // Movement becomes instant while color fades still run.
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
  await expect(page.locator(".eyebrow")).toHaveText(
    "EDITING · ONLY YOU CAN SEE THIS",
  );
  const del = page.locator("#de-del");
  const modal = page.locator("#de-confirm");
  const yes = page.locator("#de-confirm-yes");
  await del.click();
  await expect(modal).toBeVisible();
  await expect(page.locator("#de-confirm-body")).toContainText("trash");
  // The confirm button starts disabled with a countdown, so a single tap
  // does nothing. The room's own button keeps its meaning.
  await expect(yes).toBeDisabled();
  await expect(yes).toHaveText(/Move to trash \(\d\)/);
  await expect(del).toHaveText("Delete");
  await expect(page).toHaveURL(/\/admin\/paintings\/first-thaw/);
  // "Keep it" and Escape both cancel.
  await page.locator("#de-confirm-no").click();
  await expect(modal).toBeHidden();
  await del.click();
  await expect(modal).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  // The button enables after 3.5 seconds.
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
  // The frame shows the new upload as a blob URL. srcset is cleared too,
  // since the browser would otherwise keep showing the old candidate.
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
  // A preview has no inquiry form.
  await expect(page.locator("#inquiry-form")).toHaveCount(0);
  // Previews are not indexed.
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
  // Preview fields don't animate on update, since a fade per keystroke
  // flickers while typing.
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
  // Autosave debounces under a second and saves the backup without a toast.
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
  // After six lines the box grows instead of scrolling.
  await desc.fill(
    ["One.", "Two.", "Three.", "Four.", "Five.", "Six."].join("\n"),
  );
  await expect
    .poll(async () => (await desc.boundingBox())?.height ?? 0, {
      timeout: 5000,
    })
    .toBeGreaterThan(empty + 40);
  // No scrollbar, so all the text stays visible.
  expect(
    await desc.evaluate((el) => el.scrollHeight - el.clientHeight),
  ).toBeLessThanOrEqual(2);
});

test("draft save carries its publish-on date", async ({ browser }) => {
  // A stored token selects the live path. The commit route captures the file
  // instead of writing the repo, so there is nothing to clean up.
  const authed = await browser.newContext();
  await authed.addInitScript(() =>
    sessionStorage.setItem("ADMIN_API_TOKEN", "test"),
  );
  const page = await authed.newPage();
  let posted: Array<{ path: string; contentBase64: string }> | null = null;
  // Read through the closure. Assigning the untyped body inside the route
  // would narrow direct reads to `never`.
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
  // Sold sits right of the publish date, and both come before the buttons.
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

test("social words come prefilled and follow edits until she writes her own", async ({
  page,
}) => {
  await page.goto("/admin/paintings/first-thaw");
  await expect(page.locator("#de-share")).toBeVisible();
  await expect(page.locator("#de-share-title")).toHaveText("Tell social media");
  // Prefilled with the title, price and page link.
  const words = page.locator("#de-share-text");
  await expect(words).toHaveValue(/New in the gallery: “First Thaw”/);
  await expect(words).toHaveValue(/\$125\.00 CAD/);
  await expect(words).toHaveValue(/barbart\.ca\/paintings\/first-thaw/);
  // Changing the title updates the text
  await page.locator("#de-title").fill("Thaw Remix");
  await expect(words).toHaveValue(/“Thaw Remix”/);
  // until the text is edited by hand, after which it stays.
  await words.fill("My own words");
  await page.locator("#de-title").fill("Thaw Again");
  await expect(words).toHaveValue("My own words");
  // Share is the primary button, followed by the two manual options.
  const ids = await page
    .locator(".share-actions button")
    .evaluateAll((els) => els.map((el) => el.id));
  expect(ids).toEqual(["de-share-send", "de-share-photo", "de-share-copy"]);
  await expect(page.locator("#de-share-send")).toHaveClass(/btn-primary/);
});

test("copy words lands on the clipboard with a murmur", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/admin/paintings/first-thaw");
  await page.locator("#de-share-copy").click();
  await expect(page.locator("#de-share-status")).toHaveText("Copied.");
  const pasted = await page.evaluate(() => navigator.clipboard.readText());
  expect(pasted).toContain("New in the gallery: “First Thaw”");
});

test("no share sheet means no share button, just the manual way", async ({
  browser,
}) => {
  // A fresh profile with Web Share removed, regardless of the runner browser.
  const unshared = await browser.newContext();
  unshared.addInitScript(() => {
    const proto = window.Navigator.prototype as unknown as {
      share?: unknown;
      canShare?: unknown;
    };
    proto.share = undefined;
    proto.canShare = undefined;
  });
  const page = await unshared.newPage();
  await page.goto("/admin/paintings/first-thaw");
  await expect(page.locator("#de-share")).toBeVisible();
  await expect(page.locator("#de-share-send")).toBeHidden();
  await expect(page.locator("#de-share-hint")).toContainText("save the photo");
  // The manual photo and copy options are still available.
  await expect(page.locator("#de-share-photo")).toBeVisible();
  await expect(page.locator("#de-share-copy")).toBeVisible();
  await unshared.close();
});

test("drafts have no social section — no live address yet", async ({
  page,
}) => {
  await page.goto("/admin/paintings/new");
  await expect(page.locator("#de-share")).toHaveCount(0);
});

test("saving the photo toasts from the top, never murmurs inline", async ({
  page,
}) => {
  await page.goto("/admin/paintings/first-thaw");
  await page.locator("#de-share-photo").click();
  const status = page.locator("#de-share-status");
  await expect(status).toHaveText(
    "Photo saved — post it with the words above.",
  );
  await expect(status).toHaveAttribute("data-tone", "toast");
  const position = await status.evaluate((el) => getComputedStyle(el).position);
  expect(position).toBe("fixed");
});
