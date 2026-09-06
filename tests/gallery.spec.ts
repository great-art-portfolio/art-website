import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SHOW_PRICES, slugifyTitle } from "../src/lib/site";

/**
 * Gallery contract suite: what the site must show, derived from the
 * paintings collection itself — so adding a painting automatically
 * extends coverage instead of silently escaping it.
 *
 * Read-only paths only (see smoke.spec.ts warning about live secrets).
 */

interface Painting {
  slug: string;
  title: string;
  sold: boolean;
  price: string;
  modelGlb: string;
}

function loadPaintings(): Painting[] {
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
      return {
        slug: slugifyTitle(title),
        title,
        sold: /^sold:\s*true/m.test(raw),
        price: raw.match(/^price:\s*([\d.]+)/m)?.[1] ?? "0",
        modelGlb: raw.match(/^modelGlb:\s*"([^"]+)"/m)?.[1] ?? "",
      };
    });
}

const paintings = loadPaintings();
const available = paintings.filter((p) => !p.sold);
const sold = paintings.filter((p) => p.sold);

test("gallery shows one card per available painting, each linked correctly", async ({
  page,
}) => {
  expect(available.length).toBeGreaterThan(0);
  await page.goto("/");
  const cards = page.locator("#gallery-static .card");
  await expect(cards).toHaveCount(available.length);
  for (const p of available) {
    const card = page.locator(
      `#gallery-static .card[href="/paintings/${p.slug}"]`,
    );
    await expect(card).toHaveCount(1);
    await expect(card.locator(".caption-title")).toHaveText(p.title);
    const alt = await card.locator("img").getAttribute("alt");
    expect(alt?.trim() !== "").toBe(true);
  }
});

test("hovering a card prefetches its painting page", async ({ page }) => {
  expect(available.length).toBeGreaterThan(0);
  await page.goto("/");
  const href = `/paintings/${available[0].slug}`;
  const card = page.locator(`#gallery-static .card[href="${href}"]`);
  await expect(card).toHaveAttribute("data-astro-prefetch", "hover");
  // Hover must fetch the page without navigating — the next tap is instant.
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.url().endsWith(href), { timeout: 10_000 }),
    card.hover(),
  ]);
  expect(req.url().endsWith(href)).toBe(true);
  expect(page.url().endsWith("/")).toBe(true);
});

test("reduced motion keeps gallery cards planted", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const card = page.locator("#gallery-static .card").first();
  await card.hover();
  await expect(card.locator(".mat")).toHaveCSS("transform", "none");
});

test("sold archive matches the collection (absent while nothing is sold)", async ({
  page,
}) => {
  await page.goto("/");
  if (sold.length === 0) {
    await expect(page.locator("#sold")).toHaveCount(0);
    return;
  }
  await expect(page.locator("#sold .card")).toHaveCount(sold.length);
  for (const p of sold) {
    await expect(
      page.locator(`#sold .card[href="/paintings/${p.slug}"] .badge.sold`),
    ).toHaveCount(1);
  }
});

test("clicking a card opens its painting page", async ({ page }) => {
  await page.goto("/");
  await page
    .locator(`#gallery-static .card[href="/paintings/${available[0].slug}"]`)
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/paintings/${available[0].slug}/?$`),
  );
  await expect(page.locator(".info h1")).toHaveText(available[0].title);
});

for (const p of paintings) {
  test(`painting page for "${p.title}" carries its contract`, async ({
    page,
  }) => {
    await page.goto(`/paintings/${p.slug}`);
    await expect(page.locator(".info h1")).toHaveText(p.title);
    // Breadcrumb back to the collection.
    await expect(page.locator('.crumbs a[href="/"]')).toHaveCount(1);
    // Structured data for search/sharing.
    const jsonLd = await page
      .locator('script[type="application/ld+json"]')
      .textContent();
    expect(jsonLd).toContain('"@type":"Product"');
    expect(jsonLd).toContain(p.title);
    // The artist's address never appears in public markup.
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);

    if (p.sold) {
      await expect(page.locator(".sold-note")).toBeVisible();
      await expect(page.locator("#inquiry-form")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Interested?" }),
      ).toHaveCount(0);
    } else {
      if (SHOW_PRICES) {
        await expect(page.locator(".price")).toContainText(
          Number(p.price).toFixed(2),
        );
      }
      // Inquiry form: name + email required, honeypot present.
      await expect(
        page.locator('#inquiry-form input[name="name"]'),
      ).toHaveAttribute("required", "");
      await expect(
        page.locator('#inquiry-form input[name="email"]'),
      ).toHaveAttribute("required", "");
      await expect(
        page.locator('#inquiry-form input[name="website"]'),
      ).toHaveCount(1);
      // AR appears exactly when models are wired in frontmatter.
      if (p.modelGlb === "") {
        await expect(page.locator("#ar-mount")).toHaveCount(0);
        const glb = await page.locator("main.detail").getAttribute("data-glb");
        expect(glb ?? "").toBe("");
      } else {
        await expect(page.locator("#ar-mount")).toBeVisible();
        await expect(page.locator("main.detail")).toHaveAttribute(
          "data-glb",
          p.modelGlb,
        );
        // The stage holds something meaningful immediately (instant poster,
        // or the viewer itself when the observer fires during load)…
        await expect(
          page.locator("#ar-stage img, #ar-stage model-viewer"),
        ).toBeVisible();
        // …and the viewer library is certainly there once scrolled to.
        await page.locator("#ar-mount").scrollIntoViewIfNeeded();
        const viewer = page.locator("#ar-stage model-viewer");
        await expect(viewer).toBeAttached({ timeout: 15_000 });
        // Poster first, model lazy-loads as the section nears the viewport.
        await expect(viewer).toHaveAttribute("loading", "lazy");
        const poster = await viewer.getAttribute("poster");
        expect(poster !== null && poster !== "").toBe(true);
      }
    }
  });
}

test("inquiry comes before the wall preview, skeleton holds the stage", async ({
  page,
}) => {
  const [target] = available.filter((p) => p.modelGlb !== "") as [Painting];
  // Skeleton ships in the HTML (the poster swaps it out on load, so assert
  // the source, not the live DOM).
  const html = await (
    await page.request.get(`/paintings/${target.slug}`)
  ).text();
  expect(html).toContain("ar-skeleton");
  await page.goto(`/paintings/${target.slug}`);
  // The form opens with the painting still on screen: inquiry precedes AR.
  const order = await page.evaluate(() => {
    const info = document.querySelector(".info");
    const form = document.getElementById("inquiry-form");
    const ar = document.getElementById("ar-mount");
    if (info === null || form === null || ar === null) return [] as string[];
    return Array.from(info.children).map((el) => el.id || el.tagName);
  });
  expect(order).toContain("inquiry-form");
  expect(order).toContain("ar-mount");
  expect(order.indexOf("inquiry-form")).toBeLessThan(order.indexOf("ar-mount"));
});

test("viewing one painting after another shows each painting's own 3D model", async ({
  page,
}) => {
  // View Transitions keep the page script alive across navigations — the
  // viewer must follow the painting, not stick to the first one visited.
  const withModels = available.filter((p) => p.modelGlb !== "");
  expect(withModels.length).toBeGreaterThan(1);
  const [first, second] = withModels as [Painting, Painting];
  await page.goto(`/paintings/${first.slug}`);
  await page.locator("#ar-mount").scrollIntoViewIfNeeded();
  await expect(page.locator("#ar-stage model-viewer")).toHaveAttribute(
    "src",
    first.modelGlb,
    { timeout: 15_000 },
  );
  await page.locator('.crumbs a[href="/"]').click();
  await expect(page).toHaveURL(/\/$/);
  await page
    .locator(`#gallery-static .card[href="/paintings/${second.slug}"]`)
    .click();
  await expect(page).toHaveURL(new RegExp(`/paintings/${second.slug}/?$`));
  await page.locator("#ar-mount").scrollIntoViewIfNeeded();
  await expect(page.locator("#ar-stage model-viewer")).toHaveAttribute(
    "src",
    second.modelGlb,
    { timeout: 15_000 },
  );
});

test("3D model waits for the visitor to scroll to it", async ({ browser }) => {
  // Small-phone viewport: the AR section starts below the fold.
  const context = await browser.newContext({
    viewport: { width: 360, height: 640 },
  });
  const page = await context.newPage();
  const withModels = available.filter((p) => p.modelGlb !== "");
  expect(withModels.length).toBeGreaterThan(0);
  let glbRequests = 0;
  let viewerLibRequests = 0;
  await page.route("**/*.glb", async (route) => {
    glbRequests += 1;
    await route.continue();
  });
  await page.route("**/*model-viewer*.js", async (route) => {
    viewerLibRequests += 1;
    await route.continue();
  });
  await page.goto(`/paintings/${withModels[0].slug}`);
  await expect(page.locator("#ar-mount")).toBeVisible();
  // Premise check: the section must actually start out of view, or the
  // zero-request assertions below prove nothing.
  const mountTop = await page
    .locator("#ar-mount")
    .evaluate((el) => el.getBoundingClientRect().top);
  expect(mountTop).toBeGreaterThan(640);
  await page.waitForTimeout(2000);
  expect(glbRequests).toBe(0);
  expect(viewerLibRequests).toBe(0);
  await page.locator("#ar-mount").scrollIntoViewIfNeeded();
  await expect.poll(() => glbRequests, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect
    .poll(() => viewerLibRequests, { timeout: 15_000 })
    .toBeGreaterThan(0);
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              document.querySelector("#ar-stage model-viewer") as {
                loaded?: boolean;
              } | null
            )?.loaded === true,
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
  await context.close();
});

test("install option stays hidden until the browser offers it", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#install-app")).toBeHidden();
  await page.evaluate(() => {
    const e = new Event("beforeinstallprompt");
    (e as unknown as { prompt: () => void }).prompt = () => undefined;
    window.dispatchEvent(e);
  });
  const install = page.locator("#install-app");
  await expect(install).toBeVisible();
  await install.click();
  await expect(install).toBeHidden();
});

test("photo lightbox opens on tap and closes on Escape", async ({ page }) => {
  await page.goto(`/paintings/${available[0].slug}`);
  await expect(page.locator("#lightbox")).toBeHidden();
  await page.locator("#photo-wrap").click();
  await expect(page.locator("#lightbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#lightbox")).toBeHidden();
});

test("unknown painting slug is a real 404 with a way back", async ({
  page,
}) => {
  const res = await page.goto("/paintings/no-such-painting");
  expect(res?.status()).toBe(404);
  await expect(page.locator(".missing h1")).toBeVisible();
  await expect(page.locator('.missing a[href="/#collection"]')).toBeVisible();
});

test("admin page renders the studio sections and new-painting door", async ({
  page,
}) => {
  await page.goto("/admin");
  for (const id of [
    "#sec-collection",
    "#sec-banner",
    "#sec-views",
    "#sec-info",
  ]) {
    await expect(page.locator(id)).toBeAttached();
  }
  // Grid dashboard, no anchor strip; new paintings start in their own room
  // through the header button.
  await expect(page.locator(".subnav")).toHaveCount(0);
  await expect(page.locator(".admin-grid")).toBeVisible();
  await expect(
    page.locator('nav a.nav-cta[href="/admin/paintings/new"]'),
  ).toBeVisible();
  await expect(page.locator("#admin-token")).toBeAttached();
});

test("admin mode keeps painting-to-painting navigation in reach", async ({
  browser,
}) => {
  const authed = await browser.newContext();
  await authed.addInitScript(() =>
    sessionStorage.setItem("ADMIN_API_TOKEN", "test"),
  );
  const adminPage = await authed.newPage();
  await adminPage.goto(`/paintings/${available[0].slug}`);
  // Back to the collection (all paintings) and across to the studio.
  await expect(adminPage.locator('.crumbs a[href="/"]')).toBeVisible();
  await expect(
    adminPage.locator('#admin-bar a[href="/admin#sec-collection"]'),
  ).toBeVisible();
  await authed.close();
});

test("admin mode opens the painting's studio room from the buyer page", async ({
  browser,
}) => {
  const authed = await browser.newContext();
  await authed.addInitScript(() =>
    sessionStorage.setItem("ADMIN_API_TOKEN", "test"),
  );
  const adminPage = await authed.newPage();
  await adminPage.goto(`/paintings/${available[0].slug}`);
  const door = adminPage.locator(
    `#admin-bar a[href="/admin/paintings/${available[0].slug}"]`,
  );
  await expect(door).toHaveText("Edit in the studio");
  await door.click();
  await expect(adminPage.locator("#de-title")).toHaveValue(available[0].title);
  await authed.close();
});

test("studio room toolbar wears the studio styling", async ({ browser }) => {
  const authed = await browser.newContext();
  await authed.addInitScript(() =>
    sessionStorage.setItem("ADMIN_API_TOKEN", "test"),
  );
  const adminPage = await authed.newPage();
  await adminPage.goto(`/admin/paintings/${available[0].slug}`);
  // Primary Save and plain Delete both styled, not browser defaults.
  await expect(adminPage.locator("#de-save")).toHaveCSS(
    "border-radius",
    "12px",
  );
  await expect(adminPage.locator("#de-save")).toHaveCSS(
    "background-color",
    "rgb(35, 32, 27)",
  );
  await expect(adminPage.locator("#de-del")).toHaveCSS("border-radius", "12px");
  await authed.close();
});

test("service worker serves the worker script but never caches admin", async ({
  page,
}) => {
  const sw = await page.goto("/sw.js");
  expect(sw?.ok()).toBeTruthy();

  const adminCached = async (): Promise<boolean> =>
    page.evaluate(async () => {
      const keys = await caches.keys();
      for (const k of keys) {
        const reqs = await (await caches.open(k)).keys();
        if (reqs.some((r) => new URL(r.url).pathname.startsWith("/admin")))
          return true;
      }
      return false;
    });

  // Positive control: a public page IS cached after repeat visits…
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.goto("/");
  const homeCached = await page.evaluate(async () => {
    const keys = await caches.keys();
    for (const k of keys) {
      const reqs = await (await caches.open(k)).keys();
      if (reqs.some((r) => new URL(r.url).pathname === "/")) return true;
    }
    return false;
  });
  expect(homeCached).toBe(true);

  // …while the studio never is — dashboard or painting rooms.
  await page.goto("/admin");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.goto("/admin");
  await expect(
    page.locator('nav a.nav-cta[href="/admin/paintings/new"]'),
  ).toBeVisible();
  expect(await adminCached()).toBe(false);
  await page.goto("/admin/paintings/new");
  expect(await adminCached()).toBe(false);
});

test("offline inquiry queues on the phone and sends on reconnect", async ({
  page,
}) => {
  expect(available.length).toBeGreaterThan(0);
  let attempts = 0;
  await page.route("**/api/inquiries", async (route) => {
    attempts += 1;
    // First send fails (the Calgary–Edmonton drive); the retry succeeds.
    if (attempts === 1) return route.abort("failed");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });
  await page.goto(`/paintings/${available[0].slug}`);
  // iPhones have no Background Sync — take the worker replay out, so this
  // exercises the reconnect flush instead of the service worker path.
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    Object.defineProperty(reg, "sync", {
      value: undefined,
      configurable: true,
    });
  });
  await page.locator("#inquiry-reveal").click();
  await page.locator('#inquiry-form input[name="name"]').fill("Review Buyer");
  await page
    .locator('#inquiry-form input[name="email"]')
    .fill("buyer@example.com");
  await page
    .locator('#inquiry-form textarea[name="message"]')
    .fill("Love this piece.");
  await page.locator('#inquiry-form button[type="submit"]').click();
  await expect(page.locator("#inquiry-status")).toContainText(
    "Saved — it will send",
  );
  expect(attempts).toBe(1);
  // Back online: the armed outbox replays without another tap.
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => attempts, { timeout: 10_000 }).toBe(2);
});
