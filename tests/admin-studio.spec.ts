import { expect, test, type Page } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { slugifyTitle } from "../src/lib/site";

/**
 * Admin studio journey: mom types /admin and reaches everything from
 * there — no URLs to remember. Signed-out visitors see zero admin chrome.
 *
 * Delete is exercised only up to the confirm arm: tests never remove
 * collection content.
 */

function loadPaintings(): Array<{ slug: string; title: string }> {
  const dir = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "src",
    "content",
    "paintings",
  );
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const raw = readFileSync(join(dir, f), "utf8");
      const title = raw.match(/^title:\s*"([^"]+)"/m)?.[1] ?? "";
      return { slug: slugifyTitle(title), title };
    })
    .filter((p) => p.title !== "");
}

const paintings = loadPaintings();

const paintingsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "content",
  "paintings",
);

/**
 * The e2e server has no publishing backend (dummy GitHub token), so the
 * admin API would 403. Serve the local collection instead: file list +
 * file reads, exactly the shapes /api/commit returns live.
 */
async function mockCommitApi(page: Page): Promise<void> {
  await page.route("**/api/commit*", async (route) => {
    const req = route.request();
    if (req.method() === "PUT") {
      const files = readdirSync(paintingsDir).filter((f) => f.endsWith(".md"));
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ files }),
      });
    }
    if (req.method() === "GET") {
      const name = (new URL(req.url()).searchParams.get("path") ?? "").split("/").pop() ?? "";
      try {
        const content = readFileSync(join(paintingsDir, name), "utf8");
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ content }),
        });
      } catch {
        return route.fulfill({ status: 400, contentType: "application/json", body: "{}" });
      }
    }
    return route.continue();
  });
  await page.route("**/api/analytics*", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ views: [], unconfigured: false }),
    }),
  );
}

test("studio header links home, never to visitor funnels", async ({ page }) => {
  await mockCommitApi(page);
  await page.goto("/admin");
  await expect(page.locator(".site-nav .nav-links a")).toHaveCount(3);
  await expect(page.locator('.site-nav .nav-links a[href="/admin/gallery"]')).toHaveCount(1);
  await expect(page.locator('nav a[href="/#notify"]')).toHaveCount(0);
  await expect(page.locator(".card .step")).toHaveCount(0);
  // Retry buttons stay hidden while sections load on their own.
  await expect(page.locator("#collection-refresh")).toBeHidden();
  await expect(page.locator("#views-refresh")).toBeHidden();
  // Plain-words copy, no operator jargon.
  const body = (await page.locator("#main").textContent()) ?? "";
  expect(body).not.toContain("Publishing needs the live site");
  expect(body).not.toContain("Analytics isn't wired up");
});

test("collection rows link to their painting pages", async ({ page }) => {
  expect(paintings.length).toBeGreaterThan(0);
  await mockCommitApi(page);
  await page.goto("/admin");
  for (const p of paintings) {
    await expect(page.locator(`#edit-list a[href="/paintings/${p.slug}"]`)).toHaveCount(1);
  }
  await page.locator(`#edit-list a[href="/paintings/${paintings[0].slug}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/paintings/${paintings[0].slug}/?$`));
});

test("status bar sticks where she can see it", async ({ page }) => {
  await page.goto("/admin");
  const pos = await page
    .locator("#admin-status")
    .evaluate((el) => getComputedStyle(el).position);
  expect(pos).toBe("sticky");
});

test("add form waits behind its button", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.locator("#upload-form")).toBeHidden();
  await page.locator("#add-toggle").click();
  await expect(page.locator("#upload-form")).toBeVisible();
  await expect(page.locator("#add-toggle")).toHaveText("Close");
});

test("collection names the missing API token when the API refuses", async ({ page }) => {
  await page.route(
    "**/api/commit*",
    async (route) =>
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized" }),
      }),
  );
  await page.goto("/admin");
  await expect(page.locator("#edit-list")).toContainText("API token");
  await expect(page.locator("#collection-refresh")).toBeVisible();
});

test("views names the local preview when analytics is down", async ({ page }) => {
  await mockCommitApi(page);
  // Later routes win: this overrides the mock's analytics success above.
  await page.route("**/api/analytics*", async (route) => await route.abort("failed"));
  await page.goto("/admin");
  await expect(page.locator("#views-list")).toContainText("local preview");
  await expect(page.locator("#views-refresh")).toBeHidden();
});

test("admin mode follows her through the whole gallery", async ({ browser }) => {
  const authed = await browser.newContext();
  await authed.addInitScript(() =>
    sessionStorage.setItem("ADMIN_API_TOKEN", "test"),
  );
  const page = await authed.newPage();
  await mockCommitApi(page);
  await page.goto("/");
  const cards = page.locator("#gallery-static .card");
  expect(await cards.count()).toBeGreaterThan(0);
  for (let i = 0; i < (await cards.count()); i += 1) {
    const href = await cards.nth(i).getAttribute("href");
    expect(href?.startsWith("/paintings/")).toBe(true);
  }
  await cards.first().click();
  await expect(page.locator("#admin-bar")).toBeVisible();
  await page.locator("#admin-edit-toggle").click();
  const panel = page.locator("#admin-edit");
  await expect(panel).toBeVisible({ timeout: 15_000 });
  // Edit surface with delete tucked behind a confirm arm — never fired here.
  await expect(panel.locator("#ae-del")).toBeVisible();
  await panel.locator("#ae-del").click();
  await expect(panel.locator("#ae-status")).toContainText("Tap again to confirm");
  await authed.close();
});

test("visitors see zero admin chrome", async ({ page }) => {
  await page.goto(`/paintings/${paintings[0].slug}`);
  await expect(page.locator("#admin-bar")).toBeHidden();
  await expect(page.locator("#admin-edit-toggle")).toBeHidden();
  await expect(page.locator("#ae-del")).toHaveCount(0);
  await page.goto("/admin");
  await expect(page.locator('nav a[href="/#notify"]')).toHaveCount(0);
});

test("studio dashboard grids without sideways scroll on a phone", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto("/admin");
  // The anchor strip is gone; sections grid instead.
  await expect(page.locator(".subnav")).toHaveCount(0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.locator(".admin-grid .card").first()).toBeVisible();
  // Her way home stays visible on a phone (non-CTA links hide by default).
  await expect(page.locator('.site-nav .nav-links a.keep[href="/"]')).toBeVisible();
  await context.close();
});

test("studio collection links every painting to its admin page", async ({ browser }) => {
  const authed = await browser.newContext();
  await authed.addInitScript(() => window.localStorage.setItem("ADMIN_API_TOKEN", "test"));
  const page = await authed.newPage();
  await page.goto("/admin/gallery");
  await expect(page.locator("#studio-notice")).toBeHidden();
  for (const p of paintings) {
    await expect(page.locator(`#studio-grid .card[href="/paintings/${p.slug}"]`)).toHaveCount(1);
  }
  const first = page.locator("#studio-grid .card").first();
  const href = await first.getAttribute("href");
  await first.click();
  await expect(page).toHaveURL(new RegExp(`${href}/?$`));
  await expect(page.locator("#admin-bar")).toBeVisible();
  await authed.close();
});

test("visitors meet the studio gate, not the collection", async ({ page }) => {
  await page.goto("/admin/gallery");
  await expect(page.locator("#studio-notice")).toBeVisible();
  await expect(page.locator("#studio-grid")).toBeHidden();
});

test("leave admin clears the browser and lands home", async ({ browser }) => {
  const authed = await browser.newContext();
  const page = await authed.newPage();
  await page.goto("/admin");
  // Set once (addInitScript would re-run on the post-leave navigation and
  // replant the token, defeating the assertion).
  await page.evaluate(() => window.localStorage.setItem("ADMIN_API_TOKEN", "test"));
  await page.reload();
  await page.locator("#leave-admin").click();
  await expect(page).toHaveURL(/\/$/);
  const leftover = await page.evaluate(() => {
    try {
      return [
        window.localStorage.getItem("ADMIN_API_TOKEN"),
        window.sessionStorage.getItem("ADMIN_API_TOKEN"),
      ];
    } catch {
      return ["blocked", "blocked"];
    }
  });
  expect(leftover).toEqual([null, null]);
  await authed.close();
});
