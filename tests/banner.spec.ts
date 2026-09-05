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
  let posted: { message: string; files: Array<{ path: string; contentBase64: string }> } | null =
    null;
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

  await page.goto("/admin");
  await expect(page.locator("#f-announce")).toBeVisible();
  await expect(page.locator("#announce-meta")).toContainText("No banner", {
    timeout: 15_000,
  });

  const values = await page.locator("#f-duration option").evaluateAll((opts) =>
    opts.map((o) => (o as HTMLOptionElement).value),
  );
  expect(values).toEqual(["", "1", "3", "7", "14"]);
  await expect(page.locator("#f-duration")).toHaveValue("7");

  await page.locator("#f-announce").fill("Lilac Festival this Sunday!");
  await page.locator("#f-duration").selectOption("3");
  await page.locator("#announce-save").click();
  await expect(page.locator("#admin-status")).toContainText("Banner updated");

  expect(posted !== null).toBe(true);
  expect(posted?.message).toBe("Update homepage banner");
  expect(posted?.files).toHaveLength(1);
  expect(posted?.files[0]?.path).toBe("src/content/announcement.txt");
  const body = Buffer.from(posted?.files[0]?.contentBase64 ?? "", "base64").toString("utf8");
  expect(body).toBe(`expires: ${localToday(3)}\nLilac Festival this Sunday!`);
});

test("empty banner text clears the file", async ({ page }) => {
  let posted: { files: Array<{ path: string; contentBase64: string }> } | null = null;
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

  await page.goto("/admin");
  await expect(page.locator("#announce-meta")).toContainText("Showing now", {
    timeout: 15_000,
  });
  await page.locator("#f-announce").fill("");
  await page.locator("#announce-save").click();
  await expect(page.locator("#admin-status")).toContainText("Banner cleared.");
  const body = Buffer.from(posted?.files[0]?.contentBase64 ?? "", "base64").toString("utf8");
  expect(body).toBe("");
});

test("active banner shows above the collection", async ({ page }) => {
  const text = "Lilac Festival this Sunday!";
  await page.route("http://127.0.0.1:4321/", async (route) => {
    const res = await route.fetch();
    const html = (await res.text()).replace(
      '<section class="collection" id="collection"',
      `<p class="announce" data-expires="${localToday(7)}">${text}</p>` +
        '<section class="collection" id="collection"',
    );
    await route.fulfill({ response: res, body: html });
  });
  await page.goto("/");
  const banner = page.locator(".announce");
  await expect(banner).toBeVisible();
  await expect(banner).toHaveText(text);
  const bannerBox = await banner.boundingBox();
  const collectionBox = await page.locator("#collection").boundingBox();
  expect(bannerBox !== null && collectionBox !== null).toBe(true);
  expect(bannerBox?.y ?? 0).toBeLessThan(collectionBox?.y ?? 0);
});

test("forgotten banner hides itself past its end date", async ({ page }) => {
  await page.route("http://127.0.0.1:4321/", async (route) => {
    const res = await route.fetch();
    const html = (await res.text()).replace(
      '<section class="collection" id="collection"',
      `<p class="announce" data-expires="${localToday(-2)}">Old news</p>` +
        '<section class="collection" id="collection"',
    );
    await route.fulfill({ response: res, body: html });
  });
  await page.goto("/");
  await expect(page.locator(".announce")).toHaveCount(0);
  // The gallery is unaffected — still the full collection.
  await expect(page.locator("#gallery-static .card").first()).toBeVisible();
});
