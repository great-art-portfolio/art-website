import { expect, test, type Page } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { slugifyTitle } from "../src/lib/site";

/**
 * Admin studio journey: mom types /admin and reaches everything from
 * there — no URLs to remember. Signed-out visitors see zero admin chrome.
 *
 * Live delete is exercised only up to the confirm arm (tests never remove
 * collection content); dev-list deletes run fully — they only touch an
 * in-memory copy and a reload restores the repo state.
 */

function loadPaintings(): Array<{ slug: string; title: string }> {
  const dir = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "src",
    "content",
    "paintings",
  );
  return (
    readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => {
        const raw = readFileSync(join(dir, f), "utf8");
        const title = raw.match(/^title:\s*"([^"]+)"/m)?.[1] ?? "";
        const draft = /^draft:\s*true/m.test(raw);
        return { slug: slugifyTitle(title), title, draft };
      })
      // Buyer links below: drafts link to the studio room instead.
      .filter((p) => p.title !== "" && !p.draft)
  );
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
      const name =
        (new URL(req.url()).searchParams.get("path") ?? "").split("/").pop() ??
        "";
      try {
        const content = readFileSync(join(paintingsDir, name), "utf8");
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ content }),
        });
      } catch {
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: "{}",
        });
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
  // ← Leave Admin, Add painting. Leave doubles as logout (clears the token).
  // View counts live inside the collection rows themselves, so the nav
  // carries no metrics link.
  await expect(page.locator(".site-nav .nav-links a")).toHaveCount(2);
  await expect(page.locator("#nav-metrics")).toHaveCount(0);
  await expect(
    page.locator('nav a.nav-cta[href="/admin/paintings/new"]'),
  ).toHaveText("Add painting");
  await expect(page.locator('nav a[href="/#notify"]')).toHaveCount(0);
  await expect(page.locator(".card .step")).toHaveCount(0);
  // The collection Retry stays hidden while the section loads on its own.
  await expect(page.locator("#collection-refresh")).toBeHidden();
  // Plain-words copy, no operator jargon.
  const body = (await page.locator("#main").textContent()) ?? "";
  expect(body).not.toContain("Publishing needs the live site");
  expect(body).not.toContain("Analytics isn't wired up");
});

test("draft rows link photo and title to the studio room", async ({ page }) => {
  // Drafts have no buyer page: their links must open the room, never a
  // 404. Stubbed file so the test needs no real draft in the tree.
  await page.route("**/api/commit*", async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({
        json: { files: ["drafty.md"] },
      });
    } else if (route.request().method() === "GET") {
      await route.fulfill({
        json: {
          content: `---\ntitle: "Drafty"\nprice: 10\ndraft: true\n---\n\nBody.\n`,
        },
      });
    } else {
      await route.continue();
    }
  });
  await page.goto("/admin");
  // Scoped to the stubbed row: the baked static rows paint first and the
  // client render swaps them moments later.
  const row = page.locator(".row-card", { hasText: "Drafty" });
  await expect(row.locator(".row-title")).toHaveAttribute(
    "href",
    "/admin/paintings/drafty",
  );
  await expect(row.locator(".row-photo")).toHaveCount(0);
});

test("collection rows link to their painting pages", async ({ page }) => {
  expect(paintings.length).toBeGreaterThan(0);
  await mockCommitApi(page);
  await page.goto("/admin");
  for (const p of paintings) {
    // One title link per painting — plus its photo link when it has one.
    await expect(
      page.locator(`#edit-list a.row-title[href="/paintings/${p.slug}"]`),
    ).toHaveCount(1);
  }
  // The title link hugs its text: empty space beside it stays dead.
  const title = page.locator(
    `#edit-list a.row-title[href="/paintings/${paintings[0].slug}"]`,
  );
  // Retried: hydration can swap the rows mid-measure, briefly detaching
  // the handle (zero box) before the identical markup lands again.
  await expect(async () => {
    const widths = await title.evaluate((el) => {
      const li = el.closest(".row-card");
      return {
        link: el.getBoundingClientRect().width,
        row: li === null ? 0 : li.getBoundingClientRect().width,
      };
    });
    expect(widths.link).toBeGreaterThan(0);
    expect(widths.link).toBeLessThan(widths.row);
  }).toPass();
  await title.click();
  await expect(page).toHaveURL(
    new RegExp(`/paintings/${paintings[0].slug}/?$`),
  );
});

test("admin links wear the accent, never browser blue", async ({ page }) => {
  await page.goto("/admin");
  // The dev suffix proves the script ran — the row links it carries must
  // still wear the accent (they have no scope attribute).
  await expect(page.locator("#collection-dev")).toContainText(
    "Development only",
  );
  // Deferred reveals fade in instead of snapping — but the heading
  // itself is never touched.
  await expect(page.locator("#collection-dev")).toHaveClass(/fade-in/);
  await expect(page.locator("#collection-title")).not.toHaveClass(/fade-in/);
  const color = await page
    .locator("#edit-list .row-title")
    .first()
    .evaluate((el) => getComputedStyle(el).color);
  expect(color).toBe("rgb(164, 74, 36)");
});

test("studio hovers match the footer: underline only, no color flash", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/admin");
  const accent = "rgb(208, 129, 89)";
  for (const sel of ["#edit-list .row-title", "#edit-list .row-edit"]) {
    const link = page.locator(sel).first();
    await expect(link).toHaveCSS("color", accent);
    await expect(link).toHaveCSS("transition-duration", "0.12s");
    await link.hover();
    // Underline fades in; the text itself never leaves the accent.
    await expect(link).toHaveCSS("color", accent);
    await expect(link).not.toHaveCSS(
      "text-decoration-color",
      "rgba(0, 0, 0, 0)",
    );
  }
});

test("reduced motion kills movement, keeps gentle fades", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockCommitApi(page);
  await page.goto("/admin");
  // … while color and underline fades still transition.
  await expect(page.locator("#edit-list .row-title").first()).toHaveCSS(
    "transition-duration",
    "0.12s",
  );
  // Buttons never lift.
  await page.locator('nav a.nav-cta[href="/admin/paintings/new"]').hover();
  await expect(
    page.locator('nav a.nav-cta[href="/admin/paintings/new"]'),
  ).toHaveCSS("transform", "none");
  await expect(page.locator("#edit-list .row-edit").first()).toHaveCSS(
    "color",
    "rgb(164, 74, 36)",
  );
});

test("collection rows stop well short of the card edge on desktop", async ({
  page,
}) => {
  await page.goto("/admin");
  const list = page.locator("#edit-list");
  await expect(list).toBeVisible();
  // Rows arrive as static markup — no skeleton flash, no layout shift.
  await expect(page.locator("#edit-list .row-card").first()).toBeVisible();
  await expect(page.locator("#edit-list .skel")).toHaveCount(0);
  // The groups together fill the whole card — no empty half. Summed
  // (not just the available group) so drafting in dev can't fail it:
  // a drafts group simply takes its own column beside the rest.
  const card =
    (await page.locator("#sec-collection").boundingBox())?.width ?? 0;
  const groups = page.locator("#edit-list .list-group");
  await expect(
    page.locator('#edit-list .list-group[data-group="available"]'),
  ).toBeVisible();
  let total = 0;
  for (let i = 0; i < (await groups.count()); i++) {
    total += (await groups.nth(i).boundingBox())?.width ?? 0;
  }
  expect(total).toBeGreaterThan(0);
  expect(total).toBeGreaterThan(card * 0.85);
  // A grid of paintings, not a 1D list: cards sit side by side.
  const cards = page.locator(
    '#edit-list .list-group[data-group="available"] .row-card',
  );
  await expect(async () => {
    expect(await cards.count()).toBeGreaterThan(1);
    const firstX = (await cards.nth(0).boundingBox())?.x ?? 0;
    const secondX = (await cards.nth(1).boundingBox())?.x ?? 0;
    expect(secondX).toBeGreaterThan(firstX);
  }).toPass();
  // Edit (pencil) and Delete (trash) ride side by side with icons.
  await expect(cards.first().locator(".row-edit")).toContainText("Edit");
  await expect(cards.first().locator(".row-edit svg")).toBeAttached();
  await expect(cards.first().locator(".row-del")).toContainText("Delete");
  await expect(cards.first().locator(".row-del svg")).toBeAttached();
});

test("sold gets its own foldable row under everything", async ({ page }) => {
  await page.goto("/admin");
  const fold = page.locator("#edit-list .sold-fold");
  await expect(fold).toBeVisible();
  await expect(fold.locator("summary")).toContainText(/sold$/);
  // Full width under the groups, not a third column.
  const listW = (await page.locator("#edit-list").boundingBox())?.width ?? 0;
  const foldW = (await fold.boundingBox())?.width ?? 0;
  const availY =
    (
      await page
        .locator('#edit-list .list-group[data-group="available"]')
        .boundingBox()
    )?.y ?? 0;
  const foldY = (await fold.boundingBox())?.y ?? 0;
  expect(foldW).toBeGreaterThan(listW * 0.9);
  expect(foldY).toBeGreaterThan(availY);
  // Folding hides the rows; opening brings them back.
  await fold.locator("summary").click();
  await expect(fold.locator(".row-card").first()).toBeHidden();
  await fold.locator("summary").click();
  await expect(fold.locator(".row-card").first()).toBeVisible();
});

async function dragFirstOntoLast(page: Page): Promise<{
  n: number;
  firstMd: string | null;
}> {
  const cards = page.locator('[data-group="available"] .row-card');
  // The dashboard wires dragging after its first collection pass — a
  // native drag before that is just a link drag, so wait for the flag.
  await expect(cards.first()).toHaveAttribute("draggable", "true", {
    timeout: 15_000,
  });
  const n = await cards.count();
  expect(n).toBeGreaterThan(1);
  const first = cards.nth(0);
  const last = cards.nth(n - 1);
  const firstMd = await first.locator(".row-del").getAttribute("data-md");
  // Drop onto the last card's center: the dragged card lands before it.
  // (dragTo drives a real native drag; manual mouse steps never
  // dispatch drop in this Chromium.)
  await first.dragTo(last);
  return { n, firstMd };
}

test("dragging Available rows commits the new gallery order", async ({
  browser,
}) => {
  // Stored token means the live path: a real commit, not the practice tab.
  const authed = await browser.newContext();
  await authed.addInitScript(() =>
    sessionStorage.setItem("ADMIN_API_TOKEN", "test"),
  );
  const page = await authed.newPage();
  let posted: {
    message: string;
    files: Array<{ path: string; contentBase64: string }>;
  } | null = null;
  await mockCommitApi(page);
  // Registered after the mock so POST lands here first; everything else
  // falls back through to it.
  await page.route("**/api/commit*", async (route) => {
    if (route.request().method() === "POST") {
      posted = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true }, status: 201 });
    } else {
      await route.fallback();
    }
  });
  await page.goto("/admin");
  const { n, firstMd } = await dragFirstOntoLast(page);
  await expect
    .poll(() => posted?.message ?? null, { timeout: 15_000 })
    .toBe("Reorder gallery");
  expect(posted?.files.length).toBe(n);
  // The moved painting now sits just before the last card.
  const moved = posted?.files.find((f) => f.path === firstMd);
  expect(moved).not.toBe(undefined);
  const body = Buffer.from(moved?.contentBase64 ?? "", "base64").toString(
    "utf8",
  );
  expect(body).toMatch(new RegExp(`^order: ${n - 2}$`, "m"));
  await expect(page.locator("#admin-status")).toContainText(
    "Gallery order saved",
  );
  await authed.close();
});

test("dragging in practice keeps the order in this tab", async ({ page }) => {
  // No token on a local preview: the practice overlay, never a commit.
  await mockCommitApi(page);
  await page.goto("/admin");
  const { n } = await dragFirstOntoLast(page);
  await expect(page.locator("#admin-status")).toContainText(
    "kept in this tab",
    {
      timeout: 15_000,
    },
  );
  const overlay = await page.evaluate(() =>
    window.localStorage.getItem("studio-practice-v1"),
  );
  expect(overlay).not.toBe(null);
  const upserts = (
    JSON.parse(overlay ?? "{}") as {
      upserts: Record<string, { order?: number }>;
    }
  ).upserts;
  const orders = Object.values(upserts ?? {}).map((u) => u.order);
  expect(orders.length).toBe(n);
  expect(new Set(orders).size).toBe(n);
});

test("delete warms to clay red, never brand orange", async ({ page }) => {
  await page.goto("/admin");
  const del = page.locator("#edit-list .row-del").first();
  await expect(del).toBeVisible();
  // The ease is on the color itself, not just the end state.
  const ease = await del.evaluate((el) => getComputedStyle(el).transition);
  expect(ease).toContain("color");
  await del.hover();
  await expect(del).toHaveCSS("color", "rgb(179, 85, 69)");
});

test("info links list plainly, and Advanced eases open", async ({ page }) => {
  await page.goto("/admin");
  expect(
    await page
      .locator("#sec-info ul")
      .evaluate((el) => getComputedStyle(el).listStyleType),
  ).toBe("none");
  await expect(page.locator("#admin-token")).toBeHidden();
  await expect(page.locator("#sec-info summary")).toContainText(
    "Advanced Settings",
  );
  // The Advanced Settings heading stands clear of the lines above it.
  await expect(page.locator("#sec-info summary")).toHaveCSS(
    "margin-top",
    "24px",
  );
  await page.locator("#sec-info summary").click();
  await expect(page.locator("#admin-token")).toBeVisible();
});

test("errors toast over the page wherever she is scrolled", async ({
  page,
}) => {
  await page.goto("/admin");
  // Saving an empty banner with no backend behind it: a panel error.
  await page.locator("#f-announce").fill("");
  await page.locator("#announce-save").click();
  await expect(page.locator("#admin-status")).not.toBeEmpty({
    timeout: 15_000,
  });
  // Every message re-rises the toast.
  await expect(page.locator("#admin-status.toast-in")).toHaveCount(1);
  const pos = await page
    .locator("#admin-status")
    .evaluate((el) => getComputedStyle(el).position);
  expect(pos).toBe("fixed");
  // Scrolled to the bottom, the toast still sits inside the viewport.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const box = await page.locator("#admin-status").boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (box !== null && viewport !== null) {
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  }
});

test("collection names the missing API token when the API refuses", async ({
  page,
}) => {
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

test("view counts land in their collection rows", async ({ page }) => {
  await mockCommitApi(page);
  // Later routes win: this overrides the mock's empty views above.
  await page.route("**/api/analytics*", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        views: [
          { slug: "first-thaw", views: 10 },
          { slug: "prairie-moon", views: 1 },
        ],
        unconfigured: false,
      }),
    }),
  );
  await page.goto("/admin");
  // No card anywhere — each count sits inside its own row, words and all.
  await expect(page.locator("#sec-views")).toHaveCount(0);
  // Tag a photo before the counts land: patching them in must never
  // rebuild the rows (photos would flicker).
  const img = page.locator("#edit-list img.thumb").first();
  await expect(img).toBeVisible();
  const handle = await img.elementHandle();
  await expect(page.locator('.row-card:has-text("First Thaw")')).toContainText(
    "10 views",
  );
  expect(handle !== null).toBe(true);
  if (handle !== null) {
    expect(await page.evaluate((el) => el.isConnected, handle)).toBe(true);
  }
  await expect(
    page.locator('.row-card:has-text("Prairie Moon")'),
  ).toContainText("1 view");
});

test("rows stay count-less when analytics is empty", async ({ page }) => {
  await mockCommitApi(page); // analytics: unconfigured false, views []
  const analytics = page.waitForResponse("**/api/analytics*");
  await page.goto("/admin");
  await analytics;
  await expect(page.locator("#sec-views")).toHaveCount(0);
  // Rows rendered AND the (empty) answer arrived — still no counts.
  await expect(page.locator("#edit-list")).toContainText("First Thaw");
  await expect(page.locator("#edit-list")).not.toContainText("view");
});

test("good-to-know names e-transfer, shippers open in a new tab", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(page.locator("#sec-info")).toContainText(
    "start with e-transfer",
  );
  for (const name of ["Chit Chats", "Pirate Ship"]) {
    await expect(page.getByRole("link", { name })).toHaveAttribute(
      "target",
      "_blank",
    );
  }
});

test("collection photos never flicker on load", async ({ page }) => {
  await page.goto("/admin");
  // Dashboard script ran (dev suffix) — the rows below are final.
  await expect(page.locator("#collection-dev")).toContainText(
    "Development only",
  );
  const img = page.locator("#edit-list img.thumb").first();
  await expect(img).toBeVisible();
  const handle = await img.elementHandle();
  expect(handle !== null).toBe(true);
  if (handle === null) return;
  // No re-render swaps identical markup underneath.
  await page.waitForTimeout(1500);
  expect(await page.evaluate((el) => el.isConnected, handle)).toBe(true);
});

test("rows render count-less while analytics hangs", async ({ page }) => {
  await mockCommitApi(page);
  // Hang the analytics call: the response never arrives.
  await page.route("**/api/analytics*", async () => {
    await new Promise<never>(() => undefined);
  });
  await page.goto("/admin");
  // Rows don't wait for counts — and no card or note appears instead.
  await expect(page.locator("#sec-views")).toHaveCount(0);
  await expect(page.locator("#edit-list")).toContainText("First Thaw");
  await expect(page.locator("#edit-list")).not.toContainText("view");
});

test("dead analytics leaves rows alone, with no card or note", async ({
  page,
}) => {
  await mockCommitApi(page);
  // Later routes win: this overrides the mock's analytics success above.
  await page.route(
    "**/api/analytics*",
    async (route) => await route.abort("failed"),
  );
  await page.goto("/admin");
  await expect(page.locator("#sec-views")).toHaveCount(0);
  await expect(page.locator("#edit-list")).toContainText("First Thaw");
  await expect(page.locator("#edit-list")).not.toContainText("preview");
});

test("admin mode follows her through the whole gallery", async ({
  browser,
}) => {
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
  // The studio door carries the painting's own room.
  const href = await page.locator("#admin-bar a").first().getAttribute("href");
  expect(href?.startsWith("/admin/paintings/")).toBe(true);
  await authed.close();
});

test("visitors see zero admin chrome", async ({ page }) => {
  await page.goto(`/paintings/${paintings[0].slug}`);
  await expect(page.locator("#admin-bar")).toBeHidden();
  await page.goto("/admin");
  await expect(page.locator('nav a[href="/#notify"]')).toHaveCount(0);
});

test("studio dashboard grids without sideways scroll on a phone", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto("/admin");
  // The anchor strip is gone; sections grid instead.
  await expect(page.locator(".subnav")).toHaveCount(0);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  // Share panel stays hidden until the browser offers sharing — the
  // first card a phone actually shows is the collection.
  await expect(
    page.locator(".admin-grid .card:not([hidden])").first(),
  ).toBeVisible();
  // Her way home stays visible on a phone (non-CTA links hide by default).
  await expect(
    page.locator('.site-nav .nav-links a.keep[href="/"]'),
  ).toBeVisible();
  await context.close();
});

test("studio wakes up on every visit, not just full loads", async ({
  page,
}) => {
  await mockCommitApi(page);
  await page.route("**/api/analytics*", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        views: [
          { slug: "first-thaw", views: 10 },
          { slug: "prairie-moon", views: 5 },
        ],
        unconfigured: false,
      }),
    }),
  );
  await page.goto("/admin");
  // Row counts prove the dashboard init ran on this load…
  await expect(page.locator('.row-card:has-text("First Thaw")')).toContainText(
    "10 views",
  );
  // Out through a painting's buyer page (client-side hop), back again.
  await page.locator("#edit-list a.row-title").first().click();
  await expect(page).toHaveURL(/\/paintings\//);
  await page.goBack();
  await expect(page).toHaveURL(/\/admin/);
  // …and again on the return visit — lists refilled, and the new-painting
  // door still opens its room.
  await expect(page.locator('.row-card:has-text("First Thaw")')).toContainText(
    "10 views",
  );
  await page.locator('nav a.nav-cta[href="/admin/paintings/new"]').click();
  await expect(page.locator("#de-title")).toBeVisible();
});

test("banner lifetimes are 1/3/7/14 days plus no end date", async ({
  page,
}) => {
  await page.goto("/admin");
  const values = await page
    .locator("#f-duration option")
    .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));
  expect(values).toEqual(["", "1", "3", "7", "14"]);
  // Actions side by side, status always below them.
  await expect(page.locator("#announce-save + #announce-clear")).toHaveCount(1);
  await expect(page.locator("#announce-meta")).not.toBeEmpty();
  // …and fades in instead of snapping.
  await expect(page.locator("#announce-meta")).toHaveClass(/fade-in/);
  const btnBox = await page.locator("#announce-save").boundingBox();
  const metaBox = await page.locator("#announce-meta").boundingBox();
  expect(btnBox !== null && metaBox !== null).toBe(true);
  if (btnBox !== null && metaBox !== null) {
    expect(metaBox.y).toBeGreaterThanOrEqual(btnBox.y + btnBox.height - 4);
  }
});

test("collection groups available then sold, never bare statuses", async ({
  page,
}) => {
  await mockCommitApi(page);
  await page.goto("/admin");
  await expect(page.locator(".list-sub h3").first()).toHaveText("Available");
  const text = (await page.locator("#edit-list").textContent()) ?? "";
  expect(text).not.toContain("— available");
  expect(text).not.toContain("— sold");
  // Every row carries its thumbnail and its studio door (one Edit link
  // per card — drafts link their titles to the room instead of buyers).
  const links = await page
    .locator('#edit-list a.row-title[href^="/paintings/"]')
    .count();
  expect(links).toBeGreaterThan(0);
  await expect(page.locator("#edit-list .row-edit")).toHaveCount(
    await page.locator("#edit-list .row-card").count(),
  );
  await expect(page.locator("#edit-list img.thumb").first()).toBeVisible();
});

test("collection falls back to the baked-in list when the API fails", async ({
  page,
}) => {
  // Even a reachable API can fail its list call — in dev the page's own
  // baked-in list covers for it, with practice edits and deletes.
  await page.route("**/api/commit*", async (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "boom" }),
    }),
  );
  await page.goto("/admin");
  const rows = page.locator('#edit-list a.row-title[href^="/paintings/"]');
  await expect(rows.first()).toBeVisible();
  // Every row still carries its thumbnail and its studio door (one Edit
  // link per card — drafts link their titles to the room instead).
  await expect(page.locator("#edit-list .row-edit")).toHaveCount(
    await page.locator("#edit-list .row-card").count(),
  );
  await expect(page.locator("#edit-list img.thumb").first()).toBeVisible();
  await expect(page.locator("#collection-refresh")).toBeHidden();
  await expect(page.locator("#collection-dev")).toContainText(
    "Development only",
  );
  // Script-built rows still wear the studio styles (accent links, boxed rows).
  const color = await rows.first().evaluate((el) => getComputedStyle(el).color);
  expect(color).toBe("rgb(164, 74, 36)");
  const box = await rows.first().evaluate((el) => {
    const li = el.closest("li");
    return li === null ? "" : getComputedStyle(li).borderStyle;
  });
  expect(box).not.toBe("none");
});

test("practice draft from the new room lands in the dashboard Drafts section", async ({
  page,
}) => {
  await page.goto("/admin/paintings/new");
  await page.locator("#de-title").fill("Practice Piece");
  await page.locator("#de-price").fill("999.99");
  await page
    .locator("#de-photo")
    .setInputFiles("src/content/paintings/1943x1967.jpg");
  await page.locator("#de-save-draft").click();
  // Saving lands back on the dashboard with its confirmation…
  await expect(page).toHaveURL(/\/admin\/?$/);
  await expect(page.locator("#admin-status")).toContainText(
    'Draft "Practice Piece" kept',
    {
      timeout: 15_000,
    },
  );
  // …and the Drafts section appears, practice row inside.
  await expect(page.locator("#edit-list")).toContainText("Drafts");
  await expect(page.locator("#edit-list")).toContainText("Practice Piece");
  await expect(page.locator("#practice-reset")).toBeVisible();
});

test("practice reset clears the overlay back to the repo list", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "studio-practice-v1",
      JSON.stringify({
        upserts: {
          "seeded-practice": {
            slug: "seeded-practice",
            title: "Seeded Practice",
            price: 10,
            sold: false,
            alt: "",
            description: "",
            widthIn: "",
            heightIn: "",
            depthIn: "",
            medium: "",
            draft: true,
          },
        },
        deletes: [],
      }),
    );
  });
  await page.goto("/admin");
  await expect(page.locator("#edit-list")).toContainText("Seeded Practice");
  await page.locator("#practice-reset").click();
  await expect(page.locator("#edit-list")).not.toContainText("Seeded Practice");
  await expect(page.locator("#practice-reset")).toBeHidden();
});

test("toast words fade in and out, even under reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "studio-practice-v1",
      JSON.stringify({
        upserts: {
          "seeded-practice": {
            slug: "seeded-practice",
            title: "Seeded Practice",
            price: 10,
            sold: false,
            alt: "",
            description: "",
            widthIn: "",
            heightIn: "",
            depthIn: "",
            medium: "",
            draft: true,
          },
        },
        deletes: [],
      }),
    );
  });
  await page.goto("/admin");
  await page.locator("#practice-reset").click();
  const toast = page.locator("#admin-status");
  await expect(toast).toContainText("Practice changes cleared");
  // All news rides high, under the sticky header — nothing hides low.
  const high = await toast.evaluate((el) => {
    const s = getComputedStyle(el);
    return { position: s.position, top: Number.parseFloat(s.top) };
  });
  expect(high.position).toBe("fixed");
  expect(high.top).toBeGreaterThan(60);
  expect(high.top).toBeLessThan(200);
  // Opacity-only fade runs despite reduced motion.
  await expect(toast).toHaveClass(/toast-in/);
  const running = await toast.evaluate((el) => el.getAnimations().length);
  expect(running).toBeGreaterThanOrEqual(1);
  // Six seconds later it fades out instead of snapping away.
  await page.clock.fastForward(6000);
  await expect(toast).toHaveClass(/toast-out/);
  await expect(toast).not.toBeEmpty();
  await page.clock.fastForward(1000);
  await expect(toast).toBeEmpty();
  // Errors ride the same high line, tinted red.
  await toast.evaluate((el) => {
    el.textContent = "Nope.";
    el.dataset.tone = "error";
  });
  const pos = await toast.evaluate((el) => {
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

test("dashboard delete asks first, then removes the row", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "studio-practice-v1",
      JSON.stringify({
        upserts: {
          "doomed-piece": {
            slug: "doomed-piece",
            title: "Doomed Piece",
            price: 10,
            sold: false,
            alt: "",
            description: "",
            widthIn: "",
            heightIn: "",
            depthIn: "",
            medium: "",
            draft: true,
          },
        },
        deletes: [],
      }),
    );
  });
  await page.goto("/admin");
  // Drafts get their own column beside Available on desktop.
  await expect(async () => {
    const availX =
      (
        await page
          .locator('#edit-list .list-group[data-group="available"]')
          .boundingBox()
      )?.x ?? 0;
    const draftsX =
      (
        await page
          .locator('#edit-list .list-group[data-group="drafts"]')
          .boundingBox()
      )?.x ?? 0;
    expect(draftsX).toBeGreaterThan(availX);
  }).toPass();
  const row = page.locator('.row-card:has-text("Doomed Piece")');
  await expect(row).toBeVisible();
  const del = row.locator(".row-del");
  const modal = page.locator("#row-confirm");
  const yes = page.locator("#row-confirm-yes");
  // One tap opens the question — nothing deleted, nowhere navigated.
  await del.click();
  await expect(modal).toBeVisible();
  await expect(page.locator("#row-confirm-body")).toContainText("Doomed Piece");
  await expect(yes).toBeDisabled();
  await expect(yes).toHaveText(/Delete \(\d\)/);
  await expect(row).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/?$/);
  // "Keep it" backs out with the row untouched.
  await page.locator("#row-confirm-no").click();
  await expect(modal).toBeHidden();
  await expect(row).toBeVisible();
  // After 3.5 seconds of reading time, DELETE arms and fires for real.
  await del.click();
  await expect(yes).toBeEnabled({ timeout: 8000 });
  await yes.click();
  await expect(row).toHaveCount(0);
  await expect(page.locator("#admin-status")).toContainText(
    'Deleted "Doomed Piece"',
  );
});

test("error toasts clear themselves after a few seconds", async ({ page }) => {
  await page.goto("/admin/paintings/new");
  await page.locator("#de-publish").click();
  const toast = page.locator("#de-status");
  await expect(toast).toContainText("Title and a valid price are required.");
  // Errors included: no stale complaint sits over the page.
  await expect(toast).toBeEmpty({ timeout: 10_000 });
});

test("navbar Add painting opens the new-painting room", async ({ page }) => {
  await page.goto("/admin");
  await page.locator("nav a.nav-cta").click();
  await expect(page).toHaveURL(/\/admin\/paintings\/new\/?$/);
  await expect(page.locator("#de-title")).toBeVisible();
});

test("admin wordmark stays in the studio", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.locator("#signature")).toHaveAttribute("href", "/admin");
});

test("studio inputs show one focus ring, never two", async ({ page }) => {
  await page.goto("/admin/paintings/new");
  const title = page.locator("#de-title");
  await title.click();
  await expect(title).toBeFocused();
  // The accent outline is the only ring: the border stays the quiet one.
  await expect(title).toHaveCSS("outline-width", "2px");
  await expect(title).toHaveCSS("border-color", "rgb(229, 220, 203)");
  // And the border eases rather than snapping if it ever does move.
  const borderEase = await title.evaluate(
    (el) => getComputedStyle(el).transition,
  );
  expect(borderEase).toContain("border-color");
});

test("gallery link leaves admin and lands home", async ({ browser }) => {
  const authed = await browser.newContext();
  const page = await authed.newPage();
  await page.goto("/admin");
  // Set once (addInitScript would re-run on the post-leave navigation and
  // replant the token, defeating the assertion).
  await page.evaluate(() =>
    window.localStorage.setItem("ADMIN_API_TOKEN", "test"),
  );
  await page.reload();
  await expect(page.locator("#leave-admin")).toHaveText("← Leave Admin");
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
