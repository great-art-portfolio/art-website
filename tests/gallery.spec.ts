import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SHOW_PRICES, slugifyTitle } from "../src/lib/site";

/** Gallery contract, derived from the paintings collection itself — adding a
 * painting extends coverage automatically. Read-only paths only. */

interface Painting {
  slug: string;
  title: string;
  sold: boolean;
  draft: boolean;
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
        draft: /^draft:\s*true/m.test(raw),
        price: raw.match(/^price:\s*([\d.]+)/m)?.[1] ?? "0",
        modelGlb: raw.match(/^modelGlb:\s*"([^"]+)"/m)?.[1] ?? "",
      };
    });
}

const paintings = loadPaintings();
// Drafts are studio-only: no gallery card, no buyer page, no static path.
// Every buyer-facing assertion below runs over published pieces only.
const published = paintings.filter((p) => !p.draft);
const drafts = paintings.filter((p) => p.draft);
const available = published.filter((p) => !p.sold);
const sold = published.filter((p) => p.sold);

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

test("gallery photos never paint letterbox bars", async ({ page }) => {
  await page.goto("/");
  // Zoomed pages clamp tall photos (max-height + contain): the bars must
  // melt into the mat, so the photo element itself carries no plate.
  const img = page.locator("#gallery-static .card .mat img").first();
  await expect(img).toBeVisible();
  await expect(img).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(img).toHaveCSS("object-fit", "contain");
});

test("the mat hugs every photo shape at zoom", async ({ page }) => {
  // Short viewport stands in for high zoom: the height cap clamps, and
  // the box must still match the photo's own aspect — no side margins
  // on squares, no surprises on portraits.
  await page.setViewportSize({ width: 1400, height: 500 });
  await page.goto("/");
  const imgs = page.locator("#gallery-static .card .mat img");
  const count = await imgs.count();
  expect(count).toBeGreaterThan(1);
  for (let i = 0; i < Math.min(count, 4); i++) {
    const ratio = await imgs.nth(i).evaluate((el: HTMLImageElement) => {
      const box = el.getBoundingClientRect();
      if (box.height === 0) return null;
      return {
        box: box.width / box.height,
        natural: el.naturalWidth / el.naturalHeight,
      };
    });
    expect(ratio).not.toBeNull();
    if (ratio !== null) {
      expect(Math.abs(ratio.box - ratio.natural)).toBeLessThan(0.05);
    }
  }
});

test("inquiry fields preview their ring on hover", async ({ page }) => {
  expect(available.length).toBeGreaterThan(0);
  await page.goto(`/paintings/${available[0]?.slug ?? ""}`);
  // The form hides behind "Interested?" once scripts run. Revealing
  // focuses the name box, so step off it first — this test is about
  // hover, not focus.
  await page.locator("#inquiry-reveal").click();
  await page.locator("#inquiry-form h2").click();
  const name = page.locator('#inquiry-form input[name="name"]');
  await expect(name).toBeVisible();
  // Re-park and re-hover inside the polls: a late image can shift the
  // input under a parked pointer (hover stuck on) or out from under
  // it (hover dropped) mid-fade — same pattern as the clay hover test.
  await expect(async () => {
    await page.mouse.move(5, 5);
    expect(await name.evaluate((el) => getComputedStyle(el).outlineColor)).toBe(
      "rgba(0, 0, 0, 0)",
    );
  }).toPass();
  await expect(async () => {
    await name.hover();
    expect(await name.evaluate((el) => getComputedStyle(el).outlineColor)).toBe(
      "rgba(164, 74, 36, 0.55)",
    );
  }).toPass();
  // The ring fades in — it never snaps. This guards the transition
  // itself, not just the end state.
  const preview = await name.evaluate((el) => getComputedStyle(el).transition);
  expect(preview).toContain("outline-color");
  expect(preview).toContain("0.2s");
  // The border never joins in: one ring only.
  await expect(name).toHaveCSS("border-color", "rgb(229, 220, 203)");
});

test("interested teaser whispers on light theme", async ({ page }) => {
  expect(available.length).toBeGreaterThan(0);
  await page.goto(`/paintings/${available[0]?.slug ?? ""}`);
  // The full-width teaser outlines instead of filling — the solid clay
  // stays for the in-form Send. Headless runs light by default.
  const reveal = page.locator("#inquiry-reveal");
  await expect(reveal).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  // Clay in both computed-color serializations (rgb vs P3).
  await expect(reveal).toHaveCSS("color", /164, 74, 36|0\.622 0\.289 0\.133/);
});

test("hovering a card prefetches its painting page", async ({ page }) => {
  expect(available.length).toBeGreaterThan(0);
  await page.goto("/");
  const href = `/paintings/${available[0]?.slug ?? ""}`;
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
    .locator(
      `#gallery-static .card[href="/paintings/${available[0]?.slug ?? ""}"]`,
    )
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/paintings/${available[0]?.slug ?? ""}/?$`),
  );
  await expect(page.locator(".info h1")).toHaveText(available[0]?.title ?? "");
});

for (const p of published) {
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
  await page.goto(`/paintings/${withModels[0]?.slug ?? ""}`);
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
  await page.goto(`/paintings/${available[0]?.slug ?? ""}`);
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
  await expect(page.locator(".missing .eyebrow")).toHaveText(/404/);
  await expect(page.locator('.missing a[href="/#collection"]')).toBeVisible();
});

test("drafts stay out of the gallery and buyer pages", async ({ page }) => {
  // Vacuous on a clean tree; real the moment anyone drafts in dev.
  await page.goto("/");
  for (const d of drafts) {
    await expect(
      page.locator(`#gallery-static .card[href="/paintings/${d.slug}"]`),
    ).toHaveCount(0);
    const res = await page.goto(`/paintings/${d.slug}`);
    expect(res?.status()).toBe(404);
  }
});

test("studio pages render their section and new-painting door", async ({
  page,
}) => {
  // One section per page, reached through the header nav — no second
  // nav, no anchor strip. Collection hangs its list straight on main.
  const pages: Array<[string, string | null, string]> = [
    ["/admin", null, "Collection"],
    ["/admin/banner", "#sec-banner", "Banner"],
    ["/admin/metrics", "#sec-views", "Metrics"],
    ["/admin/guide", "#sec-info", "Guide"],
  ];
  for (const [url, id, current] of pages) {
    await page.goto(url);
    if (id !== null) await expect(page.locator(id)).toBeAttached();
    // The header names all four pages, marking the open one.
    for (const label of ["Collection", "Banner", "Metrics", "Guide"]) {
      await expect(
        page.locator(".site-nav").getByRole("link", { name: label }),
      ).toBeVisible();
    }
    await expect(
      page.locator(".site-nav").getByRole("link", { name: current }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".admin-tabs")).toHaveCount(0);
  }
  await expect(page.locator(".subnav")).toHaveCount(0);
  // New paintings start in their own room through the header button.
  await page.goto("/admin");
  await expect(
    page.locator('nav a.nav-cta[href="/admin/paintings/new"]'),
  ).toBeVisible();
  // The API token lives on the Guide page, not the collection.
  await expect(page.locator("#admin-token")).toHaveCount(0);
  await page.goto("/admin/guide");
  await expect(page.locator("#admin-token")).toBeAttached();
});

test("guide drawer fades open and shut, every time", async ({ page }) => {
  await page.goto("/admin/guide");
  // One evaluate samples the whole curve — no round-trip gaps for the
  // fade to slip through. A snap would show at most two distinct
  // values; a fade shows the climb (open) and the fall (shut).
  const curve = () =>
    page.evaluate(() => {
      const vals: number[] = [];
      const el = document.querySelector("#sec-info details > :not(summary)");
      if (el === null) return vals;
      const take = async () => {
        // 400ms past the click: beyond the 80ms delay plus the
        // 250ms fade, so both ends have settled.
        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 40));
          vals.push(Number(getComputedStyle(el).opacity));
        }
      };
      return take().then(() => vals);
    });
  await page.locator("#sec-info summary").click();
  const opening = await curve();
  expect(opening[0]).toBeLessThan(1);
  expect(opening.at(-1)).toBe(1);
  expect(new Set(opening).size).toBeGreaterThan(2);
  await page.locator("#sec-info summary").click();
  const shutting = await curve();
  expect(shutting[0]).toBe(1);
  expect(shutting.at(-1)).toBe(0);
  expect(new Set(shutting).size).toBeGreaterThan(2);
  await expect(page.locator("#sec-info details")).not.toHaveAttribute(
    "open",
    "",
  );
});

test("admin mode keeps painting-to-painting navigation in reach", async ({
  browser,
}) => {
  const authed = await browser.newContext();
  await authed.addInitScript(() =>
    sessionStorage.setItem("ADMIN_API_TOKEN", "test"),
  );
  const adminPage = await authed.newPage();
  await adminPage.goto(`/paintings/${available[0]?.slug ?? ""}`);
  // Back to the collection (all paintings) and across to the studio.
  await expect(adminPage.locator('.crumbs a[href="/"]')).toBeVisible();
  await expect(adminPage.locator('#admin-bar a[href="/admin"]')).toBeVisible();
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
  await adminPage.goto(`/paintings/${available[0]?.slug ?? ""}`);
  const door = adminPage.locator(
    `#admin-bar a[href="/admin/paintings/${available[0]?.slug ?? ""}"]`,
  );
  await expect(door).toHaveText("Edit in the studio");
  await door.click();
  await expect(adminPage.locator("#de-title")).toHaveValue(
    available[0]?.title ?? "",
  );
  await authed.close();
});

test("studio room toolbar wears the studio styling", async ({ browser }) => {
  const authed = await browser.newContext();
  await authed.addInitScript(() =>
    sessionStorage.setItem("ADMIN_API_TOKEN", "test"),
  );
  const adminPage = await authed.newPage();
  await adminPage.goto(`/admin/paintings/${available[0]?.slug ?? ""}`);
  // Primary Save and plain Delete both styled, not browser defaults.
  await expect(adminPage.locator("#de-save")).toHaveCSS(
    "border-radius",
    "12px",
  );
  // Light-theme primary is clay (--primary #a44a24, P3 where kept); dark stays ink.
  await expect(adminPage.locator("#de-save")).toHaveCSS(
    "background-color",
    /164, 74, 36|0\.622 0\.289 0\.133/,
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
  await page.goto(`/paintings/${available[0]?.slug ?? ""}`);
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
