import { expect, test } from "@playwright/test";

/**
 * Banner lifecycle e2e — her actual workflow, minus the GitHub push:
 * the commit POST is intercepted and its payload asserted, so no test
 * can ever publish a real banner.
 */

const flags = {
  stripe: false,
  shippo: false,
  socialPost: false,
  email: false,
  push: false,
};

/** Local YYYY-MM-DD, same clock the site uses. */
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
  // Nothing to remove: the button stays out of the way.
  await expect(page.locator("#announce-clear")).toBeHidden();

  const values = await page
    .locator("#f-duration option")
    .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));
  expect(values).toEqual(["", "1", "3", "7", "14"]);
  await expect(page.locator("#f-duration")).toHaveValue("7");
  // A choice, not typing — the pointer finger shows on hover.
  await expect(page.locator("#f-duration")).toHaveCSS("cursor", "pointer");

  await page.locator("#f-announce").fill("Lilac Festival this Sunday!");
  await page.locator("#f-duration").selectOption("3");
  await page.locator("#announce-save").click();
  await expect(page.locator("#admin-status")).toContainText("Banner updated");

  expect(posted !== null).toBe(true);
  expect(posted?.message).toBe("Update homepage banner");
  expect(posted?.files).toHaveLength(1);
  expect(posted?.files[0]?.path).toBe("src/content/announcement.txt");
  const body = Buffer.from(
    posted?.files[0]?.contentBase64 ?? "",
    "base64",
  ).toString("utf8");
  expect(body).toBe(`expires: ${localToday(3)}\nLilac Festival this Sunday!`);
});

test("empty update is refused, Remove clears the file", async ({ page }) => {
  let posted: { files: Array<{ path: string; contentBase64: string }> } | null =
    null;
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
  // Updating empty is refused — and nothing is committed behind it.
  await page.locator("#announce-save").click();
  await expect(page.locator("#admin-status")).toContainText(
    "Write the announcement first",
  );
  expect(posted).toBe(null);
  // A nudge, not news: gone again within a few seconds.
  await expect(page.locator("#admin-status")).toBeEmpty({ timeout: 8000 });
  // Clearing is Remove's job: same empty commit, its own words.
  await page.locator("#announce-clear").click();
  await expect(page.locator("#admin-status")).toContainText("Banner cleared.");
  const body = Buffer.from(
    posted?.files[0]?.contentBase64 ?? "",
    "base64",
  ).toString("utf8");
  expect(body).toBe("");
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
  // Scoped to the injected node: a real baked banner may share the page.
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
  // No backend here, so the wording stays in this browser — and the
  // homepage shows it above the collection, like the real banner.
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
  // Remove only offers itself while a banner exists to remove.
  await expect(page.locator("#announce-clear")).toBeVisible();
  await page.locator("#announce-clear").click();
  await expect(page.locator("#announce-clear")).toBeHidden();
  await expect(page.locator("#admin-status")).toContainText("Banner cleared.");
  await expect(page.locator("#f-announce")).toHaveValue("");
  const body = Buffer.from(
    posted?.files[0]?.contentBase64 ?? "",
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
  // The gallery is unaffected — still the full collection.
  await expect(page.locator("#gallery-static .card").first()).toBeVisible();
});

test("show-until dropdown answers only its own box", async ({ page }) => {
  await page.goto("/admin/banner");
  const select = page.locator("#f-duration");
  await expect(select).toBeVisible();
  // Way right of the dropdown, level with it: the label hugs its
  // control, so no hover reaches the select from empty space.
  const box =
    (await select.boundingBox()) ??
    ({ x: 0, y: 0, width: 0, height: 0 } as const);
  await page.mouse.move(box.x + box.width + 120, box.y + box.height / 2);
  expect(await select.evaluate((el) => el.matches(":hover"))).toBe(false);
  // On the box itself, hover answers as before.
  await select.hover();
  expect(await select.evaluate((el) => el.matches(":hover"))).toBe(true);
});
