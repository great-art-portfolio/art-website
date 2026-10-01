import { expect, test } from "@playwright/test";

/**
 * Banner lifecycle e2e. The commit POST is intercepted and its payload
 * asserted, so these tests don't publish a real banner.
 */

const flags = {
  stripe: false,
  shippo: false,
  socialPost: false,
  email: false,
  push: false,
};

/** Local YYYY-MM-DD, matching the site's clock. */
function localToday(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const pad = (n: number): string => (n < 10 ? "0" : "") + n;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

test("studio banner form offers lifetimes and saves with an expiry", async ({
  page,
}) => {
  let posted: {
    message: string;
    files: Array<{ path: string; contentBase64: string }>;
  } | null = null;
  // Read through the closure. Assigning the untyped body inside the route
  // would narrow direct reads to `never`.
  const sent = (): typeof posted => posted;
  await page.route("**/api/commit*", async (route) => {
    if (route.request().method() === "POST") {
      posted = route.request().postDataJSON() as typeof posted;
      await route.fulfill({ json: { ok: true, commit: "test" }, status: 201 });
    } else {
      await route.fulfill({ json: { announcement: "" } });
    }
  });
  await page.route("**/api/status", async (route) => {
    await route.fulfill({ json: flags });
  });

  await page.goto("/admin/banner");
  await expect(page.locator("#f-announce")).toBeVisible();
  await expect(page.locator("#announce-meta")).toContainText("No banner", {
    timeout: 15_000,
  });
  // With no banner, there is nothing to remove.
  await expect(page.locator("#announce-clear")).toBeHidden();

  const values = await page
    .locator("#f-duration option")
    .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));
  expect(values).toEqual(["", "1", "3", "7", "14"]);
  await expect(page.locator("#f-duration")).toHaveValue("7");
  // The select is a choice, so it shows a pointer cursor.
  await expect(page.locator("#f-duration")).toHaveCSS("cursor", "pointer");

  await page.locator("#f-announce").fill("Lilac Festival this Sunday!");
  await page.locator("#f-duration").selectOption("3");
  await page.locator("#announce-save").click();
  await expect(page.locator("#admin-status")).toContainText("Banner updated");

  // The preview is styled as a paper note with a tape strip and the
  // handwriting font.
  const preview = page.locator("#banner-preview");
  await expect(preview).toHaveCSS("background-image", /linear-gradient/);
  await expect(preview).toHaveCSS("font-family", /Caveat/);
  const tape = await preview.evaluate((el) => {
    const style = window.getComputedStyle(el, "::before");
    return { width: style.width, height: style.height };
  });
  expect(tape.width).toBe("88px");
  expect(tape.height).toBe("24px");

  expect(sent() !== null).toBe(true);
  expect(sent()?.message).toBe("Update homepage banner");
  expect(sent()?.files).toHaveLength(1);
  expect(sent()?.files[0]?.path).toBe("src/content/announcement.txt");
  const body = Buffer.from(
    sent()?.files[0]?.contentBase64 ?? "",
    "base64",
  ).toString("utf8");
  expect(body).toBe(`expires: ${localToday(3)}\nLilac Festival this Sunday!`);
});

test("empty update is refused, Remove clears the file", async ({ page }) => {
  let posted: { files: Array<{ path: string; contentBase64: string }> } | null =
    null;
  // Read through the closure. Assigning the untyped body inside the route
  // would narrow direct reads to `never`.
  const sent = (): typeof posted => posted;
  await page.route("**/api/commit*", async (route) => {
    if (route.request().method() === "POST") {
      posted = route.request().postDataJSON() as typeof posted;
      await route.fulfill({ json: { ok: true, commit: "test" }, status: 201 });
    } else {
      await route.fulfill({
        json: { announcement: `expires: ${localToday(7)}\nOld news` },
      });
    }
  });
  await page.route("**/api/status", async (route) => {
    await route.fulfill({ json: flags });
  });

  await page.goto("/admin/banner");
  await expect(page.locator("#announce-meta")).toContainText("Showing now", {
    timeout: 15_000,
  });
  await page.locator("#f-announce").fill("");
  // An empty update is refused and nothing is committed.
  await page.locator("#announce-save").click();
  await expect(page.locator("#admin-status")).toContainText(
    "Write the announcement first",
  );
  expect(sent()).toBe(null);
  // The hint fades after a few seconds.
  await expect(page.locator("#admin-status")).toBeEmpty({ timeout: 8000 });
  // Remove sends the same empty commit with its own status text.
  await page.locator("#announce-clear").click();
  await expect(page.locator("#admin-status")).toContainText("Banner cleared.");
  const body = Buffer.from(
    sent()?.files[0]?.contentBase64 ?? "",
    "base64",
  ).toString("utf8");
  expect(body).toBe("");
});

test("preview wears the wording, fading in and out", async ({ page }) => {
  await page.route("**/api/commit*", async (route) => {
    await route.fulfill({ json: { announcement: "" } });
  });
  await page.route("**/api/status", async (route) => {
    await route.fulfill({ json: flags });
  });
  await page.goto("/admin/banner");
  const field = page.locator("#f-announce");
  const preview = page.locator("#banner-preview");
  await expect(field).toBeVisible();
  await expect(preview).toBeHidden();
  // Typing shows the note with the text updating live.
  await field.fill("Lilac Festival this Sunday!");
  await expect(preview).toBeVisible();
  await expect(preview).toHaveText("Lilac Festival this Sunday!");
  // Clearing fades the note out, then removes it from the layout.
  await field.fill("");
  await expect(preview).toBeHidden({ timeout: 5000 });
});

test("active banner shows above the collection", async ({ page }) => {
  const text = "Lilac Festival this Sunday!";
  await page.route("http://127.0.0.1:4331/", async (route) => {
    const res = await route.fetch();
    const html = (await res.text()).replace(
      '<section class="collection" id="collection"',
      `<p class="announce" data-e2e="banner" data-expires="${localToday(7)}">${text}</p>` +
        '<section class="collection" id="collection"',
    );
    await route.fulfill({ response: res, body: html });
  });
  await page.goto("/");
  // Scoped to the injected node, since a built-in banner may also be on
  // the page.
  const banner = page.locator('.announce[data-e2e="banner"]');
  await expect(banner).toBeVisible();
  await expect(banner).toHaveText(text);
  const bannerBox = await banner.boundingBox();
  const collectionBox = await page.locator("#collection").boundingBox();
  expect(bannerBox !== null && collectionBox !== null).toBe(true);
  expect(bannerBox?.y ?? 0).toBeLessThan(collectionBox?.y ?? 0);
});

test("dev without a backend keeps a banner preview for this browser", async ({
  page,
}) => {
  await page.route("**/api/commit*", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        json: { error: "GitHub publishing is not configured" },
        status: 400,
      });
    } else {
      await route.fulfill({ json: { announcement: "" } });
    }
  });
  await page.route("**/api/status", async (route) => {
    await route.fulfill({ json: flags });
  });

  await page.goto("/admin/banner");
  await expect(page.locator("#announce-meta")).toContainText("No banner", {
    timeout: 15_000,
  });
  await page.locator("#f-announce").fill("Preview market Saturday!");
  await page.locator("#announce-save").click();
  // With no backend the text is stored in this browser, and the homepage
  // shows it above the collection like the real banner.
  await expect(page.locator("#admin-status")).toContainText("preview kept");
  await page.goto("/");
  await expect(page.locator(".announce")).toHaveText(
    "Preview market Saturday!",
  );
  const bannerBox = await page.locator(".announce").boundingBox();
  const collectionBox = await page.locator("#collection").boundingBox();
  expect(bannerBox !== null && collectionBox !== null).toBe(true);
  expect(bannerBox?.y ?? 0).toBeLessThan(collectionBox?.y ?? 0);
});

test("remove banner clears it without typing", async ({ page }) => {
  let posted: { files: Array<{ path: string; contentBase64: string }> } | null =
    null;
  // Read through the closure. Assigning the untyped body inside the route
  // would narrow direct reads to `never`.
  const sent = (): typeof posted => posted;
  await page.route("**/api/commit*", async (route) => {
    if (route.request().method() === "POST") {
      posted = route.request().postDataJSON() as typeof posted;
      await route.fulfill({ json: { ok: true, commit: "test" }, status: 201 });
    } else {
      await route.fulfill({
        json: { announcement: `expires: ${localToday(7)}\nOld news` },
      });
    }
  });
  await page.route("**/api/status", async (route) => {
    await route.fulfill({ json: flags });
  });

  await page.goto("/admin/banner");
  await expect(page.locator("#announce-meta")).toContainText("Showing now", {
    timeout: 15_000,
  });
  await expect(page.locator("#f-announce")).not.toHaveValue("");
  // Remove only appears while a banner exists.
  await expect(page.locator("#announce-clear")).toBeVisible();
  await page.locator("#announce-clear").click();
  await expect(page.locator("#announce-clear")).toBeHidden();
  await expect(page.locator("#admin-status")).toContainText("Banner cleared.");
  await expect(page.locator("#f-announce")).toHaveValue("");
  const body = Buffer.from(
    sent()?.files[0]?.contentBase64 ?? "",
    "base64",
  ).toString("utf8");
  expect(body).toBe("");
});

test("forgotten banner hides itself past its end date", async ({ page }) => {
  await page.route("http://127.0.0.1:4331/", async (route) => {
    const res = await route.fetch();
    const html = (await res.text()).replace(
      '<section class="collection" id="collection"',
      `<p class="announce" data-e2e="banner" data-expires="${localToday(-2)}">Old news</p>` +
        '<section class="collection" id="collection"',
    );
    await route.fulfill({ response: res, body: html });
  });
  await page.goto("/");
  await expect(page.locator('.announce[data-e2e="banner"]')).toHaveCount(0);
  // The gallery still shows the full collection.
  await expect(page.locator("#gallery-static .card").first()).toBeVisible();
});

test("show-until dropdown answers only its own box", async ({ page }) => {
  await page.goto("/admin/banner");
  const select = page.locator("#f-duration");
  await expect(select).toBeVisible();
  // Hover well to the right of the dropdown. The label is only as wide as
  // its control, so empty space doesn't count as hovering the select.
  const box =
    (await select.boundingBox()) ??
    ({ x: 0, y: 0, width: 0, height: 0 } as const);
  await page.mouse.move(box.x + box.width + 120, box.y + box.height / 2);
  expect(await select.evaluate((el) => el.matches(":hover"))).toBe(false);
  // Hovering the box itself still highlights it.
  await select.hover();
  expect(await select.evaluate((el) => el.matches(":hover"))).toBe(true);
});
