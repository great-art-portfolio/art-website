import { expect, test, type Page } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { slugifyTitle } from "../src/lib/site";

/** Admin studio flows starting from /admin. Live deletes are only tested up
 * to the confirm step. Dev-list deletes run fully against an in-memory
 * copy. */

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
      // Drafts link to the studio room, not a buyer page.
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
 * admin API would 403. Serve the local collection instead, using the same
 * file list and file read shapes as /api/commit.
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

/**
 * Stateful commit stub. Commits rewrite files and deletes remove them, so
 * trash, restore, empty, and auto-clear read back their own writes like the
 * real backend.
 */
async function stubPaintingFiles(
  page: Page,
  initial: Record<string, string>,
): Promise<{
  commits: () => Array<{ message: string; blobs: string[] }>;
  destroys: () => Array<{ message: string; paths: string[] }>;
}> {
  const files = { ...initial };
  const commits: Array<{ message: string; blobs: string[] }> = [];
  const destroys: Array<{ message: string; paths: string[] }> = [];
  await page.route("**/api/commit*", async (route) => {
    const req = route.request();
    if (req.method() === "PUT") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ files: Object.keys(files) }),
      });
    }
    if (req.method() === "GET") {
      const name =
        (new URL(req.url()).searchParams.get("path") ?? "").split("/").pop() ??
        "";
      const content = files[name];
      if (content === undefined) {
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: "{}",
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ content }),
      });
    }
    if (req.method() === "POST") {
      const body = req.postDataJSON() as {
        message?: string;
        files?: Array<{ path: string; contentBase64: string }>;
        delete?: string[];
      } | null;
      for (const f of body?.files ?? []) {
        files[f.path.split("/").pop() ?? ""] = Buffer.from(
          f.contentBase64,
          "base64",
        ).toString("utf8");
      }
      for (const p of body?.delete ?? []) {
        delete files[p.split("/").pop() ?? ""];
      }
      if ((body?.delete ?? []).length > 0) {
        destroys.push({
          message: body?.message ?? "",
          paths: body?.delete ?? [],
        });
      } else {
        commits.push({
          message: body?.message ?? "",
          blobs: (body?.files ?? []).map((f) =>
            Buffer.from(f.contentBase64, "base64").toString("utf8"),
          ),
        });
      }
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, commit: "test" }),
      });
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
  return { commits: () => commits, destroys: () => destroys };
}

/** Minimal stub frontmatter. `extra` appends lines such as trash flags. */
function stubMd(title: string, extra = ""): string {
  return (
    `---\ntitle: "${title}"\nprice: 100\nsold: false\n` +
    `${extra}---\n\nBody.\n`
  );
}

/**
 * Seeds a sold painting through the practice overlay. A clean checkout has
 * no sold paintings, so tests that need the Sold fold use this.
 */
async function seedSoldOverlay(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "studio-practice-v1",
      JSON.stringify({
        upserts: {
          "sold-seed": {
            slug: "sold-seed",
            title: "Sold Seed",
            price: 10,
            sold: true,
            alt: "",
            description: "",
            widthIn: "",
            heightIn: "",
            depthIn: "",
            medium: "",
            draft: false,
          },
        },
        deletes: [],
      }),
    );
  });
}

test("studio header links home, never to visitor funnels", async ({ page }) => {
  await mockCommitApi(page);
  await page.goto("/admin");
  // Seven sections, Leave Admin, and Add painting. Leave Admin also clears
  // the token.
  await expect(page.locator(".site-nav .nav-links a")).toHaveCount(9);
  for (const label of [
    "Collection",
    "Banner",
    "Ping",
    "Email",
    "Metrics",
    "QR codes",
    "Guide",
  ]) {
    await expect(
      page.locator(".site-nav").getByRole("link", { name: label }),
    ).toBeVisible();
  }
  await expect(page.locator("#nav-metrics")).toHaveCount(0);
  await expect(
    page.locator('nav a.nav-cta[href="/admin/paintings/new"]'),
  ).toHaveText("Add painting");
  await expect(page.locator('nav a[href="/#notify"]')).toHaveCount(0);
  await expect(page.locator(".card .step")).toHaveCount(0);
  // Retry stays hidden while the collection loads.
  await expect(page.locator("#collection-refresh")).toBeHidden();
  // No technical jargon in the copy.
  const body = (await page.locator("#main").textContent()) ?? "";
  expect(body).not.toContain("Publishing needs the live site");
  expect(body).not.toContain("Analytics isn't wired up");
});

test("draft rows link photo and title to the studio room", async ({ page }) => {
  // Drafts have no buyer page, so their links open the room instead of a
  // 404. The file is stubbed so no real draft is needed.
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
  // Scoped to the stubbed row, since the static rows render first and the
  // client render replaces them shortly after.
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
    // One title link per painting, plus a photo link when it has a photo.
    await expect(
      page.locator(`#edit-list a.row-title[href="/paintings/${p.slug}"]`),
    ).toHaveCount(1);
  }
  // The title link is sized to its text, so the space beside it isn't
  // clickable.
  const title = page.locator(
    `#edit-list a.row-title[href="/paintings/${paintings[0]?.slug ?? ""}"]`,
  );
  // Retried because the client render can replace the rows mid-measure,
  // briefly detaching the element.
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
    new RegExp(`/paintings/${paintings[0]?.slug ?? ""}/?$`),
  );
});

test("admin links wear the accent, never browser blue", async ({ page }) => {
  await page.goto("/admin");
  // The dev note shows the script ran. Its script-built links lack the
  // scope attribute but still get the accent color.
  await expect(page.locator("#collection-dev")).toContainText(
    "Development only",
  );
  // The deferred reveal fades in, and the heading isn't affected.
  await expect(page.locator("#collection-dev")).toHaveClass(/fade-in/);
  await expect(page.locator("#collection-title")).not.toHaveClass(/fade-in/);
  const color = await page
    .locator("#edit-list .row-title")
    .first()
    .evaluate((el) => getComputedStyle(el).color);
  // Accent color in either serialization (rgb or P3).
  expect(color).toMatch(/164, 74, 36|0\.622 0\.289 0\.133/);
});

test("studio hovers match the footer: underline only, no color flash", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/admin");
  // Dark-theme accent in either serialization (rgb or P3).
  const accent = /208, 129, 89|0\.795 0\.506 0\.342/;
  for (const sel of ["#edit-list .row-title", "#edit-list .row-edit"]) {
    const link = page.locator(sel).first();
    await expect(link).toHaveCSS("color", accent);
    await expect(link).toHaveCSS("transition-duration", "0.12s");
    await link.hover();
    // The underline fades in and the text stays the accent color.
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
  // Color and underline transitions still run.
  await expect(page.locator("#edit-list .row-title").first()).toHaveCSS(
    "transition-duration",
    "0.12s",
  );
  // Buttons don't lift.
  await page.locator('nav a.nav-cta[href="/admin/paintings/new"]').hover();
  await expect(
    page.locator('nav a.nav-cta[href="/admin/paintings/new"]'),
  ).toHaveCSS("transform", "none");
  await expect(page.locator("#edit-list .row-edit").first()).toHaveCSS(
    "color",
    /164, 74, 36|0\.622 0\.289 0\.133/,
  );
});

test("collection rows stop well short of the content edge on desktop", async ({
  page,
}) => {
  await page.goto("/admin");
  const list = page.locator("#edit-list");
  await expect(list).toBeVisible();
  // Rows are in the static markup, so there's no skeleton or layout shift.
  await expect(page.locator("#edit-list .row-card").first()).toBeVisible();
  await expect(page.locator("#edit-list .skel")).toHaveCount(0);
  // Available fills the content width, and the Drafts and Sold folds stack
  // below as full-width rows.
  const main = (await page.locator("main.admin").boundingBox())?.width ?? 0;
  const groups = page.locator("#edit-list .list-group");
  await expect(
    page.locator('#edit-list .list-group[data-group="available"]'),
  ).toBeVisible();
  let total = 0;
  for (let i = 0; i < (await groups.count()); i++) {
    total += (await groups.nth(i).boundingBox())?.width ?? 0;
  }
  expect(total).toBeGreaterThan(0);
  expect(total).toBeGreaterThan(main * 0.85);
  // Cards sit side by side in a grid.
  const cards = page.locator(
    '#edit-list .list-group[data-group="available"] .row-card',
  );
  await expect(async () => {
    expect(await cards.count()).toBeGreaterThan(1);
    const firstX = (await cards.nth(0).boundingBox())?.x ?? 0;
    const secondX = (await cards.nth(1).boundingBox())?.x ?? 0;
    expect(secondX).toBeGreaterThan(firstX);
  }).toPass();
  // Edit and Delete sit side by side with icons.
  await expect(cards.first().locator(".row-edit")).toContainText("Edit");
  await expect(cards.first().locator(".row-edit svg")).toBeAttached();
  await expect(cards.first().locator(".row-del")).toContainText("Delete");
  await expect(cards.first().locator(".row-del svg")).toBeAttached();
});

test("sold gets its own foldable row under everything", async ({ page }) => {
  await seedSoldOverlay(page);
  await page.goto("/admin");
  const fold = page.locator("#edit-list .sold-fold");
  await expect(fold).toBeVisible();
  await expect(fold.locator("summary")).toContainText(/sold$/);
  // Full width below the groups, not a third column.
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

test("drafts fold away between available and sold", async ({ page }) => {
  // Seed drafts, since a clean checkout has none.
  await page.addInitScript(() => {
    const draft = (slug: string, title: string): Record<string, unknown> => ({
      slug,
      title,
      price: 10,
      sold: false,
      alt: "",
      description: "",
      widthIn: "",
      heightIn: "",
      depthIn: "",
      medium: "",
      draft: true,
    });
    window.localStorage.setItem(
      "studio-practice-v1",
      JSON.stringify({
        upserts: {
          "fold-a": draft("fold-a", "Fold A"),
          "fold-b": draft("fold-b", "Fold B"),
          // The fold sits above Sold, so seed a sold painting too.
          "sold-seed": {
            ...draft("sold-seed", "Sold Seed"),
            sold: true,
            draft: false,
          },
        },
        deletes: [],
      }),
    );
  });
  await page.goto("/admin");
  const fold = page.locator("#edit-list .drafts-fold");
  await expect(fold).toBeVisible();
  await expect(fold.locator("summary")).toContainText(/drafts$/);
  // Full-width row below Available and above Sold.
  const listW = (await page.locator("#edit-list").boundingBox())?.width ?? 0;
  const foldW = (await fold.boundingBox())?.width ?? 0;
  expect(foldW).toBeGreaterThan(listW * 0.9);
  const availBottom = await page
    .locator('#edit-list .list-group[data-group="available"]')
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top + r.height;
    });
  const soldTop =
    (await page.locator("#edit-list .sold-fold").boundingBox())?.y ?? 0;
  const foldY = (await fold.boundingBox())?.y ?? 0;
  expect(foldY).toBeGreaterThan(availBottom);
  expect(soldTop).toBeGreaterThan(foldY);
  // Folding hides the rows; opening brings them back.
  await fold.locator("summary").click();
  await expect(fold.locator(".row-card").first()).toBeHidden();
  await fold.locator("summary").click();
  await expect(fold.locator(".row-card").first()).toBeVisible();
});

async function dragFirstOntoLast(page: Page): Promise<{
  n: number;
  firstMd: string | null;
  before: string[];
}> {
  const cards = page.locator('[data-group="available"] .row-card');
  // Dragging is wired after the first collection render. Before that a
  // drag is just a link drag, so wait for the attribute.
  await expect(cards.first()).toHaveAttribute("draggable", "true", {
    timeout: 15_000,
  });
  const n = await cards.count();
  expect(n).toBeGreaterThan(1);
  const before = await cards.locator(".row-title").allTextContents();
  const first = cards.nth(0);
  const last = cards.nth(n - 1);
  const firstMd = await first.locator(".row-del").getAttribute("data-md");
  // Dropping on the last card's center places the dragged card before it.
  // dragTo performs a native drag. Manual mouse steps don't dispatch drop
  // in this Chromium.
  await first.dragTo(last);
  return { n, firstMd, before };
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
  // Read through a closure. TypeScript narrows direct reads to never,
  // since the assignment happens inside the route callback.
  const sent = (): typeof posted => posted;
  await mockCommitApi(page);
  // Registered after the mock so it handles POST first. Other requests
  // fall back to the mock.
  await page.route("**/api/commit*", async (route) => {
    if (route.request().method() === "POST") {
      posted = route.request().postDataJSON() as typeof posted;
      await route.fulfill({ json: { ok: true, commit: "test" }, status: 201 });
    } else {
      await route.fallback();
    }
  });
  await page.goto("/admin");
  const { n, firstMd, before } = await dragFirstOntoLast(page);
  await expect
    .poll(() => sent()?.message ?? null, { timeout: 15_000 })
    .toBe("Reorder gallery");
  // Only rows whose position changed are rewritten. The last card stays
  // put, so n-1 files are committed.
  expect(sent()?.files.length).toBe(n - 1);
  // The moved painting now sits just before the last card.
  const moved = sent()?.files.find((f) => f.path === firstMd);
  expect(moved).not.toBe(undefined);
  const body = Buffer.from(moved?.contentBase64 ?? "", "base64").toString(
    "utf8",
  );
  expect(body).toMatch(new RegExp(`^order: ${n - 2}$`, "m"));
  await expect(page.locator("#admin-status")).toContainText(
    "Gallery order saved",
  );
  // The dashboard shows the first card just before the last.
  await expect
    .poll(
      () =>
        page
          .locator('[data-group="available"] .row-card .row-title')
          .allTextContents(),
      { timeout: 15_000 },
    )
    .toEqual([...before.slice(1, n - 1), before[0], before[n - 1]]);
  await authed.close();
});

test("dragging Sold rows commits the new sold order", async ({ browser }) => {
  // Stored token means the live path: a real commit, not the practice tab.
  const authed = await browser.newContext();
  await authed.addInitScript(() =>
    sessionStorage.setItem("ADMIN_API_TOKEN", "test"),
  );
  const page = await authed.newPage();
  // Three sold paintings through the commit stub, since reordering needs
  // more than one.
  const soldFiles: Record<string, { title: string; order: number }> = {
    "sold-a.md": { title: "Sold A", order: 0 },
    "sold-b.md": { title: "Sold B", order: 1 },
    "sold-c.md": { title: "Sold C", order: 2 },
  };
  await page.route("**/api/commit*", async (route) => {
    const req = route.request();
    if (req.method() === "PUT") {
      await route.fulfill({ json: { files: Object.keys(soldFiles) } });
    } else if (req.method() === "GET") {
      const name =
        (new URL(req.url()).searchParams.get("path") ?? "").split("/").pop() ??
        "";
      const row = soldFiles[name];
      if (row === undefined) {
        await route.fulfill({ status: 400, json: {} });
      } else {
        await route.fulfill({
          json: {
            content:
              `---\ntitle: "${row.title}"\nprice: 100\nsold: true\n` +
              `order: ${row.order}\n---\n\nBody.\n`,
          },
        });
      }
    } else {
      await route.continue();
    }
  });
  let posted: {
    message: string;
    files: Array<{ path: string; contentBase64: string }>;
  } | null = null;
  // Read through a closure. TypeScript narrows direct reads to never,
  // since the assignment happens inside the route callback.
  const sent = (): typeof posted => posted;
  // Registered after the stub so it handles POST first. Other requests
  // fall back to the stub.
  await page.route("**/api/commit*", async (route) => {
    if (route.request().method() === "POST") {
      posted = route.request().postDataJSON() as typeof posted;
      await route.fulfill({ json: { ok: true, commit: "test" }, status: 201 });
    } else {
      await route.fallback();
    }
  });
  await page.goto("/admin");
  const cards = page.locator('[data-group="sold"] .row-card');
  await expect(cards.first()).toHaveAttribute("draggable", "true", {
    timeout: 15_000,
  });
  await expect(cards).toHaveCount(3);
  const titles = page.locator('[data-group="sold"] .row-card .row-title');
  const before = await titles.allTextContents();
  const firstMd = await cards
    .first()
    .locator(".row-del")
    .getAttribute("data-md");
  await cards.nth(0).dragTo(cards.nth(2));
  await expect
    .poll(() => sent()?.message ?? null, { timeout: 15_000 })
    .toBe("Reorder gallery");
  // The moved painting's file has its new index,
  const moved = sent()?.files.find((f) => f.path === firstMd);
  expect(moved).not.toBe(undefined);
  const body = Buffer.from(moved?.contentBase64 ?? "", "base64").toString(
    "utf8",
  );
  const at = Number(body.match(/^order: (\d+)$/m)?.[1] ?? "-1");
  expect(at).toBeGreaterThanOrEqual(0);
  await expect(page.locator("#admin-status")).toContainText("Sold order saved");
  // and the dashboard shows it there.
  const after = await titles.allTextContents();
  expect(after).not.toEqual(before);
  expect(after[at]).toBe(before[0]);
  await authed.close();
});

test("switching studio sections fades the page", async ({ page }) => {
  await page.goto("/admin");
  // Navigate through the header, then check 30ms into the 220ms fade that
  // an animation is running.
  const fading = await page.evaluate(
    () =>
      new Promise((resolve: (v: boolean) => void) => {
        document.addEventListener(
          "astro:after-swap",
          () => {
            window.setTimeout(() => {
              const main = document.getElementById("main");
              resolve(main !== null && main.getAnimations().length > 0);
            }, 30);
          },
          { once: true },
        );
        document
          .querySelector('.site-nav a.sec[href="/admin/metrics"]')
          ?.dispatchEvent(
            new MouseEvent("click", { bubbles: true, cancelable: true }),
          );
        window.setTimeout(() => resolve(false), 8000);
      }),
  );
  expect(fading).toBe(true);
  await expect(page).toHaveURL(/\/admin\/metrics/);
  await expect(page.locator("#main")).toBeVisible();
});

test("draggable rows show the grab fist, closing it mid-drag", async ({
  page,
}) => {
  await page.goto("/admin");
  const card = page.locator('[data-group="available"] .row-card').first();
  await expect(card).toHaveAttribute("draggable", "true", {
    timeout: 15_000,
  });
  await expect
    .poll(
      async () => await card.evaluate((el) => getComputedStyle(el).cursor),
      { timeout: 15_000 },
    )
    .toBe("grab");
  // Pressing shows the grabbing cursor. Releasing without a drop commits
  // nothing.
  await card.hover();
  await page.mouse.down();
  await expect
    .poll(async () => await card.evaluate((el) => getComputedStyle(el).cursor))
    .toBe("grabbing");
  await page.mouse.up();
});

test("delete moves to trash, restore brings it back, purge destroys", async ({
  browser,
}) => {
  // Stored token means the live path: real commits, not the practice tab.
  const authed = await browser.newContext();
  await authed.addInitScript(() =>
    sessionStorage.setItem("ADMIN_API_TOKEN", "test"),
  );
  const page = await authed.newPage();
  const { commits, destroys } = await stubPaintingFiles(page, {
    "trash-a.md": stubMd("Trash A"),
    "trash-b.md": stubMd("Trash B"),
  });
  await page.goto("/admin");
  const available = page.locator('[data-group="available"] .row-card');
  await expect(available).toHaveCount(2);
  // Delete asks first, then moves the painting to trash.
  await available.first().locator(".row-del").click();
  await expect(page.locator("#row-confirm")).toBeVisible();
  await expect(page.locator("#row-confirm-title")).toHaveText("Move to trash?");
  await expect(page.locator("#row-confirm-yes")).toBeEnabled({ timeout: 8000 });
  await page.locator("#row-confirm-yes").click();
  await expect
    .poll(() => commits().at(-1)?.message ?? null, { timeout: 15_000 })
    .toBe("Move to trash: Trash A");
  expect(commits().at(-1)?.blobs[0] ?? "").toContain("trash: true");
  expect(commits().at(-1)?.blobs[0] ?? "").toMatch(
    /^trashedAt: "\d{4}-\d{2}-\d{2}"$/m,
  );
  await expect(available).toHaveCount(1);
  await expect(page.locator("#edit-list .trash-fold summary")).toContainText(
    "1 trashed",
  );
  await expect(page.locator("#admin-status")).toContainText(
    "30 days to change your mind",
  );
  // Restore brings it back without a confirmation.
  await page.locator("#edit-list .trash-fold summary").click();
  await page.locator('[data-group="trash"] .row-restore').click();
  await expect
    .poll(() => commits().at(-1)?.message ?? null, { timeout: 15_000 })
    .toBe("Restore painting: Trash A");
  await expect(available).toHaveCount(2);
  await expect(page.locator("#edit-list .trash-fold")).toHaveCount(0);
  await expect(page.locator("#admin-status")).toContainText(
    "back in the collection",
  );
  // Delete forever asks again, then deletes the files.
  await available.first().locator(".row-del").click();
  await expect(page.locator("#row-confirm-yes")).toBeEnabled({ timeout: 8000 });
  await page.locator("#row-confirm-yes").click();
  await expect
    .poll(() => commits().at(-1)?.message ?? null, { timeout: 15_000 })
    .toBe("Move to trash: Trash A");
  await page.locator("#edit-list .trash-fold summary").click();
  await page.locator('[data-group="trash"] .row-del').click();
  await expect(page.locator("#row-confirm-title")).toHaveText(
    "Delete forever?",
  );
  await expect(page.locator("#row-confirm-yes")).toBeEnabled({ timeout: 8000 });
  await page.locator("#row-confirm-yes").click();
  await expect
    .poll(() => destroys().at(-1)?.message ?? null, { timeout: 15_000 })
    .toBe("Delete painting: Trash A");
  await expect(available).toHaveCount(1);
  await expect(page.locator("#edit-list .trash-fold")).toHaveCount(0);
  await expect(page.locator("#admin-status")).toContainText("forever");
  await authed.close();
});

test("empty trash destroys everything trashed at once", async ({ browser }) => {
  const authed = await browser.newContext();
  await authed.addInitScript(() =>
    sessionStorage.setItem("ADMIN_API_TOKEN", "test"),
  );
  const page = await authed.newPage();
  const today = new Date().toISOString().slice(0, 10);
  const { destroys } = await stubPaintingFiles(page, {
    "gone-a.md": stubMd("Gone A", `trash: true\ntrashedAt: ${today}\n`),
    "gone-b.md": stubMd("Gone B", `trash: true\ntrashedAt: ${today}\n`),
    "keeper.md": stubMd("Keeper"),
  });
  await page.goto("/admin");
  await expect(page.locator('[data-group="available"] .row-card')).toHaveCount(
    1,
  );
  // The trash fold starts closed.
  const fold = page.locator("#edit-list .trash-fold");
  await expect(fold.locator("summary")).toContainText("2 trashed");
  await expect(fold.locator(".row-card").first()).toBeHidden();
  await fold.locator("summary").click();
  await fold.locator(".row-empty").click();
  await expect(page.locator("#row-confirm-title")).toHaveText("Empty trash?");
  await expect(page.locator("#row-confirm-yes")).toBeEnabled({ timeout: 8000 });
  await page.locator("#row-confirm-yes").click();
  await expect
    .poll(() => destroys().at(-1)?.message ?? null, { timeout: 15_000 })
    .toBe("Empty trash (2 paintings)");
  await expect(page.locator("#edit-list .trash-fold")).toHaveCount(0);
  await expect(page.locator('[data-group="available"] .row-card')).toHaveCount(
    1,
  );
  await expect(page.locator("#admin-status")).toContainText("gone for good");
  await authed.close();
});

test("trash older than 30 days clears itself", async ({ browser }) => {
  const authed = await browser.newContext();
  await authed.addInitScript(() =>
    sessionStorage.setItem("ADMIN_API_TOKEN", "test"),
  );
  const page = await authed.newPage();
  const old = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10);
  const { destroys } = await stubPaintingFiles(page, {
    "old.md": stubMd("Old", `trash: true\ntrashedAt: ${old}\n`),
    "keeper.md": stubMd("Keeper"),
  });
  await page.goto("/admin");
  // Loading the page clears old trash in one commit.
  await expect
    .poll(() => destroys().at(-1)?.message ?? null, { timeout: 15_000 })
    .toBe("Clear old trash (1 paintings)");
  await expect(page.locator("#admin-status")).toContainText(
    "trashed over 30 days ago",
  );
  await expect(page.locator("#edit-list .trash-fold")).toHaveCount(0);
  await expect(page.locator('[data-group="available"] .row-card')).toHaveCount(
    1,
  );
  await authed.close();
});

test("dragging in practice keeps the order in this tab", async ({ page }) => {
  // Without a token on a local preview, saves go to the practice overlay.
  await mockCommitApi(page);
  await page.goto("/admin");
  const { n, before } = await dragFirstOntoLast(page);
  await expect(page.locator("#admin-status")).toContainText(
    "kept in this tab",
    {
      timeout: 15_000,
    },
  );
  // The list shows the dropped order in practice mode too. Polled because
  // the re-render happens shortly after the drop.
  await expect
    .poll(
      () =>
        page
          .locator('[data-group="available"] .row-card .row-title')
          .allTextContents(),
      { timeout: 15_000 },
    )
    .toEqual([...before.slice(1, n - 1), before[0], before[n - 1]]);
  // Hovering an Available photo shows the reorder hint after a few
  // seconds.
  await page.locator('[data-group="available"] .row-photo').first().hover();
  await page.waitForTimeout(1000);
  await expect(page.locator("#reorder-tip")).toBeHidden();
  await expect(page.locator("#reorder-tip")).toBeVisible({ timeout: 15000 });
  await expect(page.locator("#reorder-tip")).toContainText(
    "Drag cards to reorder",
  );
  // Moving away hides it.
  await page.mouse.move(5, 5);
  await expect(page.locator("#reorder-tip")).toBeHidden();
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
  // As with the live commit, the unmoved last card is skipped, so n-1 rows
  // reach the overlay, each with a distinct position.
  expect(orders.length).toBe(n - 1);
  expect(new Set(orders).size).toBe(n - 1);
});

test("dropping a card where it already sits stays silent", async ({ page }) => {
  // Drop the second-to-last card on the last card's center. It's already
  // there, so nothing should change or show a toast. Without a token this
  // uses the practice overlay.
  await mockCommitApi(page);
  await page.goto("/admin");
  const cards = page.locator('[data-group="available"] .row-card');
  await expect(cards.first()).toHaveAttribute("draggable", "true", {
    timeout: 15_000,
  });
  const n = await cards.count();
  expect(n).toBeGreaterThan(1);
  const before = await cards.locator(".row-title").allTextContents();
  // Read immediately instead of toBeEmpty. The retrying assertion would
  // outlast the 6s toast and pass even if a toast appeared.
  expect(await page.locator("#admin-status").textContent()).toBe("");
  await cards.nth(n - 2).dragTo(cards.nth(n - 1));
  // Give a commit or toast time to appear. Neither should.
  await page.waitForTimeout(2000);
  expect(await page.locator("#admin-status").textContent()).toBe("");
  expect(await cards.locator(".row-title").allTextContents()).toEqual(before);
  expect(
    await page.evaluate(() =>
      window.localStorage.getItem("studio-practice-v1"),
    ),
  ).toBe(null);
});

test("draft cards never trigger the reorder hint", async ({ page }) => {
  // Seed a draft, since a clean checkout has none. Without an API stub the
  // dashboard uses the baked list merged with the overlay.
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "studio-practice-v1",
      JSON.stringify({
        upserts: {
          "hintless-piece": {
            slug: "hintless-piece",
            title: "Hintless Piece",
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
  // Drafts can't be dragged, so hovering one doesn't show the hint, even
  // after the delay.
  await page.locator('[data-group="drafts"] .row-card').first().hover();
  await page.waitForTimeout(3600);
  await expect(page.locator("#reorder-tip")).toBeHidden();
});

test("delete warms to clay red, never brand orange", async ({ page }) => {
  await page.goto("/admin");
  const del = page.locator("#edit-list .row-del").first();
  await expect(del).toBeVisible();
  // The color itself transitions.
  const ease = await del.evaluate((el) => getComputedStyle(el).transition);
  expect(ease).toContain("color");
  // Hover again inside the poll. Under parallel load a late image can
  // shift the button and lose the hover.
  await expect(async () => {
    await del.hover();
    expect(await del.evaluate((el) => getComputedStyle(el).color)).toBe(
      "rgb(179, 85, 69)",
    );
  }).toPass({ timeout: 15_000 });
});

test("info links list plainly, and Advanced eases open", async ({ page }) => {
  await page.goto("/admin/guide");
  expect(
    await page
      .locator("#sec-info ul")
      .evaluate((el) => getComputedStyle(el).listStyleType),
  ).toBe("none");
  await expect(page.locator("#admin-token")).toBeHidden();
  await expect(page.locator("#sec-info summary")).toContainText(
    "Advanced Settings",
  );
  // The Advanced Settings heading has space above it.
  await expect(page.locator("#sec-info summary")).toHaveCSS(
    "margin-top",
    "24px",
  );
  await page.locator("#sec-info summary").click();
  await expect(page.locator("#admin-token")).toBeVisible();
});

test("Advanced drawer lands without a snap", async ({ page }) => {
  await page.goto("/admin/guide");
  await page.locator("#sec-info summary").click();
  await expect(page.locator("#admin-token")).toBeVisible();
  // Sample the footer position during the close. After the 350ms
  // animation it shouldn't move, which catches a close that ends short
  // and then jumps.
  const lateSteps: number[] = await page.evaluate(async () => {
    const footer = document.querySelector("footer");
    const details = document.querySelector("#sec-info details");
    if (footer === null || details === null) return [];
    details
      .querySelector("summary")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const t0 = performance.now();
    const ys: Array<[number, number]> = [];
    const samples = await new Promise<Array<[number, number]>>((resolve) => {
      const tick = (): void => {
        ys.push([
          performance.now() - t0,
          Math.round(footer.getBoundingClientRect().top),
        ]);
        if (performance.now() - t0 < 700) requestAnimationFrame(tick);
        else resolve(ys);
      };
      requestAnimationFrame(tick);
    });
    const late = samples.filter(([t]) => t > 450).map(([, y]) => y);
    const steps: number[] = [];
    for (let i = 1; i < late.length; i++)
      steps.push(Math.abs((late[i] ?? 0) - (late[i - 1] ?? 0)));
    return steps;
  });
  expect(lateSteps.length).toBeGreaterThan(0);
  expect(Math.max(...lateSteps)).toBeLessThanOrEqual(2);
});

test("drawer headers never select their words", async ({ page }) => {
  await page.goto("/admin/guide");
  await page.locator("#sec-info summary").dblclick();
  expect(
    await page.evaluate(() => window.getSelection()?.toString() ?? ""),
  ).toBe("");
});

test("drawers animate through script on every browser", async ({ page }) => {
  // Spy on Element.animate to check the drawer script runs the animation,
  // on both the guide drawer and a collection fold.
  const animatedProps = (summarySel: string): Promise<string[]> =>
    page.evaluate((sel) => {
      const seen: string[] = [];
      const proto = window.Element.prototype;
      const orig = proto.animate;
      function spy(
        this: Element,
        keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
        options?: KeyframeAnimationOptions,
      ): Animation {
        const list = Array.isArray(keyframes) ? keyframes : [];
        for (const frame of list) {
          if (frame !== null && typeof frame === "object") {
            for (const k of Object.keys(frame)) seen.push(k);
          }
        }
        return orig.call(this, keyframes, options);
      }
      proto.animate = spy as typeof proto.animate;
      document
        .querySelector(sel)
        ?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      proto.animate = orig;
      return seen;
    }, summarySel);
  // The collection fold needs a sold painting, so seed one. Init scripts
  // run on every page in this context.
  await seedSoldOverlay(page);
  await page.goto("/admin/guide");
  const guideSeen = await animatedProps("#sec-info summary");
  expect(guideSeen).toContain("height");
  expect(guideSeen).toContain("opacity");
  await page.goto("/admin");
  await expect(page.locator("#edit-list .sold-fold")).toBeVisible();
  const foldSeen = await animatedProps("#edit-list .sold-fold summary");
  expect(foldSeen).toContain("height");
  expect(foldSeen).toContain("opacity");
});

test("errors toast over the page wherever she is scrolled", async ({
  page,
}) => {
  await page.goto("/admin/banner");
  // Saving an empty banner without a backend shows an error.
  await page.locator("#f-announce").fill("");
  await page.locator("#announce-save").click();
  await expect(page.locator("#admin-status")).not.toBeEmpty({
    timeout: 15_000,
  });
  // Each message restarts the toast animation.
  await expect(page.locator("#admin-status.toast-in")).toHaveCount(1);
  const pos = await page
    .locator("#admin-status")
    .evaluate((el) => getComputedStyle(el).position);
  expect(pos).toBe("fixed");
  // Scrolled to the bottom, the toast is still in the viewport.
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
  // Later routes take precedence, overriding the mock's empty views.
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
  // No separate card. Each count is inside its row.
  await expect(page.locator("#sec-views")).toHaveCount(0);
  // Tag a photo before the counts arrive, to check that patching them in
  // doesn't rebuild the rows.
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
  // Rows rendered and the empty response arrived, so there are no counts.
  await expect(page.locator("#edit-list")).toContainText("First Thaw");
  await expect(page.locator("#edit-list")).not.toContainText("view");
});

test("metrics page ranks every painting, most watched first", async ({
  page,
}) => {
  await page.route("**/api/analytics*", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        views: [
          { slug: "prairie-moon", views: 7 },
          { slug: "first-thaw", views: 10 },
        ],
        unconfigured: false,
      }),
    }),
  );
  // Metrics rows are baked at build time and a clean checkout has no sold
  // painting, so fetch the page and mark one seed row sold.
  await page.route("**/admin/metrics*", async (route) => {
    const res = await route.fetch();
    // Pass the trailing-slash redirect through.
    if (res.status() !== 200) return route.fulfill({ response: res });
    const html = await res.text();
    const needle = '"slug":"prairie-moon","title":"Prairie Moon","sold":false';
    expect(html).toContain(needle);
    await route.fulfill({
      response: res,
      body: html.replace(needle, needle.replace("false", "true")),
    });
  });
  await page.goto("/admin/metrics");
  // The most viewed painting ranks first, with the total above the rows.
  const rows = page.locator("#stats-body .metric-row");
  await expect(rows.first()).toContainText("First Thaw");
  await expect(rows.first()).toContainText("10 views");
  await expect(rows.nth(1)).toContainText("Prairie Moon");
  await expect(rows.first().locator(".metric-thumb")).toBeVisible();
  await expect(page.locator("#stats-total")).toHaveText("17");
  // Every published painting has a row with its status. Drafts are
  // excluded.
  await expect(page.locator("#stats-body")).toContainText("Sold");
  await expect(page.locator("#stats-body")).not.toContainText("Draft");
  await expect(page.locator("#stats-note")).toBeEmpty();
});

test("metric titles answer only their own words", async ({ page }) => {
  await page.route("**/api/analytics*", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ views: [], unconfigured: true }),
    }),
  );
  await page.goto("/admin/metrics");
  const title = page.locator("#stats-body .metric-title").first();
  await expect(title).toBeVisible();
  // Just right of the title text. Measure the text range, since the link
  // box is wider. Hover and click there shouldn't reach the link.
  const words = await title.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  await page.mouse.move(
    words.x + words.width + 120,
    words.y + words.height / 2,
  );
  expect(await title.evaluate((el) => el.matches(":hover"))).toBe(false);
  // Hovering the text itself still works.
  await title.hover();
  expect(await title.evaluate((el) => el.matches(":hover"))).toBe(true);
});

test("metrics page stays count-less with plain words when empty", async ({
  page,
}) => {
  await page.route("**/api/analytics*", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ views: [], unconfigured: true }),
    }),
  );
  await page.goto("/admin/metrics");
  // Titles render while the counts are pending.
  await expect(page.locator("#stats-body")).toContainText("First Thaw");
  await expect(page.locator("#stats-total")).toHaveText("—");
  await expect(page.locator("#stats-note")).not.toBeEmpty();
});

test("good-to-know names e-transfer, shippers open in a new tab", async ({
  page,
}) => {
  await page.goto("/admin/guide");
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
  // The dev note shows the script ran, so the rows are final.
  await expect(page.locator("#collection-dev")).toContainText(
    "Development only",
  );
  const img = page.locator("#edit-list img.thumb").first();
  await expect(img).toBeVisible();
  const handle = await img.elementHandle();
  expect(handle !== null).toBe(true);
  if (handle === null) return;
  // No re-render replaces the identical markup.
  await page.waitForTimeout(1500);
  expect(await page.evaluate((el) => el.isConnected, handle)).toBe(true);
});

test("rows render count-less while analytics hangs", async ({ page }) => {
  await mockCommitApi(page);
  // Leave the analytics request pending.
  await page.route("**/api/analytics*", async () => {
    await new Promise<never>(() => undefined);
  });
  await page.goto("/admin");
  // Rows don't wait for counts, and no card or note appears.
  await expect(page.locator("#sec-views")).toHaveCount(0);
  await expect(page.locator("#edit-list")).toContainText("First Thaw");
  await expect(page.locator("#edit-list")).not.toContainText("view");
});

test("dead analytics leaves rows alone, with no card or note", async ({
  page,
}) => {
  await mockCommitApi(page);
  // Later routes take precedence, overriding the mock's analytics response.
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
  // The studio link points to this painting's room.
  const href = await page.locator("#admin-bar a").first().getAttribute("href");
  expect(href?.startsWith("/admin/paintings/")).toBe(true);
  await authed.close();
});

test("visitors see zero admin chrome", async ({ page }) => {
  await page.goto(`/paintings/${paintings[0]?.slug ?? ""}`);
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
  // No sub-nav. Each section is its own page in the header nav.
  await expect(page.locator(".subnav")).toHaveCount(0);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  // On a phone the collection list is visible without horizontal
  // scrolling.
  await expect(page.locator("#edit-list")).toBeVisible();
  // The home link stays visible on a phone, while other non-CTA links hide.
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
  // Row counts show the dashboard init ran on this load.
  await expect(page.locator('.row-card:has-text("First Thaw")')).toContainText(
    "10 views",
  );
  // Navigate client-side to a buyer page and back.
  await page.locator("#edit-list a.row-title").first().click();
  await expect(page).toHaveURL(/\/paintings\//);
  await page.goBack();
  await expect(page).toHaveURL(/\/admin/);
  // Init runs again on return. The lists refill and Add painting still
  // opens its room.
  await expect(page.locator('.row-card:has-text("First Thaw")')).toContainText(
    "10 views",
  );
  await page.locator('nav a.nav-cta[href="/admin/paintings/new"]').click();
  await expect(page.locator("#de-title")).toBeVisible();
});

test("banner lifetimes are 1/3/7/14 days plus no end date", async ({
  page,
}) => {
  await page.goto("/admin/banner");
  const values = await page
    .locator("#f-duration option")
    .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));
  expect(values).toEqual(["", "1", "3", "7", "14"]);
  // Show until, Update, and Remove share one bottom-aligned desktop row,
  // and the status fades in below. Remove is hidden without a banner, so
  // only visible controls are measured.
  const bottoms = await page
    .locator("#f-duration, #announce-save, #announce-clear:visible")
    .evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return Math.round(r.top + r.height);
      }),
    );
  expect(bottoms.length).toBeGreaterThanOrEqual(2);
  expect(new Set(bottoms).size).toBe(1);
  await expect(page.locator("#announce-meta")).not.toBeEmpty();
  await expect(page.locator("#announce-meta")).toHaveClass(/fade-in/);
  const btnBox = await page.locator("#announce-save").boundingBox();
  const metaBox = await page.locator("#announce-meta").boundingBox();
  expect(btnBox !== null && metaBox !== null).toBe(true);
  if (btnBox !== null && metaBox !== null) {
    expect(metaBox.y).toBeGreaterThanOrEqual(btnBox.y + btnBox.height - 4);
  }
});

test("tickle button pings browsers without email", async ({ page }) => {
  await page.goto("/admin/ping");
  const btn = page.locator("#tickle-send");
  await expect(btn).toBeVisible();
  // Left-aligned, not full width.
  const btnBox = await btn.boundingBox();
  const secBox = await page.locator("#sec-tickle").boundingBox();
  expect(btnBox !== null && secBox !== null).toBe(true);
  if (btnBox !== null && secBox !== null) {
    expect(btnBox.width).toBeLessThan(secBox.width / 2);
  }
  // Without keys there are no subscribers. The confirmation comes first,
  // then the empty result fades in.
  const asked: string[] = [];
  page.on("dialog", async (dialog) => {
    asked.push(dialog.message());
    await dialog.accept();
  });
  await btn.click();
  const status = page.locator("#tickle-status");
  await expect(status).toContainText("Nobody to ping yet");
  await expect(status).toHaveClass(/fade-in/);
  await expect(btn).toBeEnabled();
  expect(asked).toEqual([
    "Nobody to ping yet — no browsers subscribed. Send anyway?",
  ]);
  // Custom text is sent and stored for the ping.
  await page.locator("#tickle-body").fill("New seascape just listed");
  await btn.click();
  // Each tap clears the previous result, so wait for this tap's own cycle.
  await expect(status).toContainText("Pinging");
  await expect(status).toContainText("Nobody to ping yet");
  const stored = await page.request.get("/api/push-message");
  expect(await stored.json()).toEqual({
    body: "New seascape just listed",
    title: "",
  });
});

test("ping preview wears the notification shape live", async ({ page }) => {
  await page.goto("/admin/ping");
  const preview = page.locator("#tickle-preview");
  await expect(preview).toBeVisible();
  // Site icon, standard title, and standard note while blank.
  await expect(preview.locator("img")).toHaveAttribute("src", "/favicon.png");
  await expect(preview.locator("strong")).toHaveText(
    "Something new in the gallery",
  );
  await expect(preview.locator("#tickle-preview-body")).toHaveText(
    "Tap to see it.",
  );
  // Typed text replaces the standard note.
  await page.locator("#tickle-body").fill("New seascape just listed");
  await expect(preview.locator("#tickle-preview-body")).toHaveText(
    "New seascape just listed",
  );
  await page.locator("#tickle-body").fill("");
  await expect(preview.locator("#tickle-preview-body")).toHaveText(
    "Tap to see it.",
  );
  // The title works the same way. Blank keeps the standard one.
  await page.locator("#tickle-title").fill("Fresh today");
  await expect(preview.locator("#tickle-preview-title")).toHaveText(
    "Fresh today",
  );
  await page.locator("#tickle-title").fill("");
  await expect(preview.locator("#tickle-preview-title")).toHaveText(
    "Something new in the gallery",
  );
});

test("device preview sends a local ping, never a broadcast", async ({
  page,
}) => {
  // Stub the Notification API to record what would be shown.
  await page.addInitScript(() => {
    const seen: Array<{ title: string; opts: unknown }> = [];
    class FakeNotification {
      static permission = "granted";
      static requestPermission(): Promise<string> {
        return Promise.resolve("granted");
      }
      onclick: (() => void) | null = null;
      constructor(title: string, opts: unknown) {
        seen.push({ title, opts });
      }
      close(): void {}
    }
    (window as unknown as Record<string, unknown>)["Notification"] =
      FakeNotification;
    (window as unknown as Record<string, unknown>)["__notes"] = seen;
  });
  await page.goto("/admin/ping");
  await page.locator("#tickle-title").fill("Fresh today");
  await page.locator("#tickle-body").fill("New seascape just listed");
  await page.locator("#tickle-preview-send").click();
  // The page says the preview was sent to this browser only.
  await expect(page.locator("#tickle-status")).toContainText("Preview sent");
  // It uses the custom title, custom text, and site icon.
  const shown = await page.evaluate(
    () => (window as unknown as Record<string, unknown>)["__notes"],
  );
  expect(shown).toEqual([
    {
      title: "Fresh today",
      opts: {
        body: "New seascape just listed",
        icon: "/favicon.png",
        badge: "/favicon.png",
        tag: "gallery-preview",
      },
    },
  ]);
});

test("tickle button names its reach and asks first", async ({ page }) => {
  await page.goto("/admin/ping");
  // The placeholder shows the default note.
  await expect(page.locator("#tickle-body")).toHaveAttribute(
    "placeholder",
    "Blank: Something new in the gallery — tap to see it",
  );
  // With five subscribers, the button asks before pinging.
  await page.route("**/api/notify", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ total: 5 }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sent: 5,
          total: 5,
          gone: 0,
          failed: 0,
          emailed: false,
          emailTotal: 0,
        }),
      });
    }
  });
  const btn = page.locator("#tickle-send");
  const status = page.locator("#tickle-status");
  const asked: string[] = [];
  page.on("dialog", async (dialog) => {
    asked.push(dialog.message());
    // First say no, then yes.
    if (asked.length === 1) await dialog.dismiss();
    else await dialog.accept();
  });
  // Declining sends nothing and re-enables the button.
  await btn.click();
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0]).toBe("This will ping 5 browsers. Are you sure?");
  await expect(status).toBeEmpty();
  await expect(btn).toBeEnabled();
  // Confirming pings all five.
  await btn.click();
  await expect.poll(() => asked.length).toBe(2);
  await expect(status).toContainText("Pinged 5 of 5 browsers.");
  await expect(btn).toBeEnabled();
});

test("tickle walks big lists in batches", async ({ page }) => {
  await page.goto("/admin/ping");
  // 65 subscribers is more than one Worker call can ping.
  await page.route("**/api/notify", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ total: 65 }),
      });
      return;
    }
    const sent = await route.request().postDataJSON();
    const cursor = Number(sent?.push?.cursor ?? 0) || 0;
    const batch = 40;
    const done = Math.min(batch, 65 - cursor);
    const next = cursor + done < 65 ? cursor + done : null;
    posts.push(cursor);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sent: done,
        total: 65,
        gone: 0,
        failed: 0,
        emailed: false,
        emailTotal: 0,
        nextCursor: next,
      }),
    });
  });
  const posts: number[] = [];
  const asked: string[] = [];
  page.on("dialog", async (dialog) => {
    asked.push(dialog.message());
    await dialog.accept();
  });
  const btn = page.locator("#tickle-send");
  const status = page.locator("#tickle-status");
  await btn.click();
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0]).toBe("This will ping 65 browsers. Are you sure?");
  // Two requests (40 then 25) and one result on screen.
  await expect.poll(() => posts.length).toBe(2);
  expect(posts).toEqual([0, 40]);
  await expect(status).toContainText("Pinged 65 of 65 browsers.");
  await expect(btn).toBeEnabled();
});

test("send email button confirms the list before broadcasting", async ({
  page,
}) => {
  await page.goto("/admin/email");
  // With three addresses on the list, the button asks before sending.
  await page.route("**/api/collectors", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ total: 3 }),
    });
  });
  await page.route("**/api/notify", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          total: 0,
          emailSubject: "New painting at Barbara Straka's studio",
          emailText: "A new painting is hung in the gallery — come look:",
          emailHtml: "<h1>New painting</h1><p>Come look</p>",
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sent: 0,
        total: 0,
        emailed: true,
        emailTotal: 3,
      }),
    });
  });
  const btn = page.locator("#email-send");
  const status = page.locator("#email-status");
  const asked: string[] = [];
  page.on("dialog", async (dialog) => {
    asked.push(dialog.message());
    // First say no, then yes.
    if (asked.length === 1) await dialog.dismiss();
    else await dialog.accept();
  });
  // Declining sends nothing and re-enables the button.
  await btn.click();
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0]).toBe("This will email 3 subscribers. Are you sure?");
  await expect(status).toBeEmpty();
  await expect(btn).toBeEnabled();
  // Confirming emails all three.
  await btn.click();
  await expect.poll(() => asked.length).toBe(2);
  await expect(status).toContainText("Emailed 3 subscribers.");
  await expect(btn).toBeEnabled();
});

test("send email asks even when the count didn't load", async ({ page }) => {
  // The count request fails, so the button still asks. Declining sends
  // nothing.
  await page.route("**/api/collectors", async (route) => {
    await route.abort();
  });
  let posted = false;
  await page.route("**/api/notify", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          total: 0,
          emailSubject: "Preview subject line",
          emailText: "Preview body words.",
          emailHtml: "<h1>Preview subject line</h1><p>Preview body words.</p>",
        }),
      });
      return;
    }
    posted = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sent: 0, total: 0, emailed: true, emailTotal: 0 }),
    });
  });
  await page.goto("/admin/email");
  const asked: string[] = [];
  page.on("dialog", async (dialog) => {
    asked.push(dialog.message());
    await dialog.dismiss();
  });
  await page.locator("#email-send").click();
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0]).toBe("Couldn't load the subscriber count — send anyway?");
  await expect(page.locator("#email-status")).toBeEmpty();
  await expect(page.locator("#email-send")).toBeEnabled();
  expect(posted).toBe(false);
});

test("email page previews the exact email buyers get", async ({ page }) => {
  let posted: unknown = null;
  await page.route("**/api/notify", async (route) => {
    if (route.request().method() === "POST") {
      posted = route.request().postDataJSON() as typeof posted;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sent: 1,
          total: 1,
          emailed: true,
          emailTotal: 1,
        }),
      });
      return;
    }
    // Echo the draft fields the way the server composes them.
    const params = new URL(route.request().url()).searchParams;
    const esc = (s: string): string =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const subject = params.get("subject") ?? "";
    const bodyText = params.get("body") ?? "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        total: 1,
        emailSubject: subject,
        emailText: bodyText,
        emailHtml: `<h1>${esc(subject)}</h1><p>${esc(bodyText)}</p>`,
      }),
    });
  });
  await page.goto("/admin/email");
  // Both fields start with the standard text.
  await expect(page.locator("#email-subject")).toHaveValue(
    "New painting at Barbara Straka's studio",
  );
  await expect(page.locator("#email-body")).toHaveValue(
    "A new painting is hung in the gallery — come look: https://barbart.ca",
  );
  await expect(page.locator("#email-preview")).toBeVisible();
  await expect(page.locator("#email-preview-subject")).toHaveText(
    "New painting at Barbara Straka's studio",
  );
  // The body is the styled email in a sandboxed iframe.
  const frame = page.frameLocator("#email-preview-body");
  await expect(frame.locator("h1")).toHaveText(
    "New painting at Barbara Straka's studio",
  );
  await expect(frame.locator("body")).toContainText("come look");
  // Typed text shows in the preview and is included in the send.
  await page.locator("#email-body").fill("Fresh off the easel");
  await expect(frame.locator("body")).toContainText("Fresh off the easel");
  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.locator("#email-send").click();
  await expect(page.locator("#email-status")).toContainText(
    "Emailed 1 subscribers.",
  );
  expect(posted).toEqual({
    push: false,
    email: {
      subject: "New painting at Barbara Straka's studio",
      body: "Fresh off the easel",
    },
  });
});

test("collection groups available then sold, never bare statuses", async ({
  page,
}) => {
  await mockCommitApi(page);
  await page.goto("/admin");
  await expect(page.locator("#collection-title")).toHaveText("Available");
  const text = (await page.locator("#edit-list").textContent()) ?? "";
  expect(text).not.toContain("— available");
  expect(text).not.toContain("— sold");
  // Every row has a thumbnail and one Edit link. Draft titles link to the
  // room instead of a buyer page.
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
  // If the list call fails in dev, the page falls back to its baked list
  // with practice edits and deletes.
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
  // Every row still has a thumbnail and one Edit link.
  await expect(page.locator("#edit-list .row-edit")).toHaveCount(
    await page.locator("#edit-list .row-card").count(),
  );
  await expect(page.locator("#edit-list img.thumb").first()).toBeVisible();
  await expect(page.locator("#collection-refresh")).toBeHidden();
  await expect(page.locator("#collection-dev")).toContainText(
    "Development only",
  );
  // Script-built rows still get the studio styles.
  const color = await rows.first().evaluate((el) => getComputedStyle(el).color);
  // Accent color in either serialization (rgb or P3).
  expect(color).toMatch(/164, 74, 36|0\.622 0\.289 0\.133/);
  const box = await rows.first().evaluate((el) => {
    const li = el.closest("li");
    return li === null ? "" : getComputedStyle(li).borderStyle;
  });
  expect(box).not.toBe("none");
});

test("practice draft from the new room lands in the dashboard Drafts section", async ({
  page,
}) => {
  // Seed a second draft so the fold label pluralizes ("2 drafts"). The
  // save redirects back here and re-runs this init script, so merge into
  // the overlay instead of overwriting it, or the saved draft is lost.
  await page.addInitScript(() => {
    const key = "studio-practice-v1";
    let overlay: { upserts: Record<string, unknown>; deletes: string[] } = {
      upserts: {},
      deletes: [],
    };
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        const parsed = JSON.parse(raw) as typeof overlay;
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          typeof parsed.upserts === "object" &&
          parsed.upserts !== null
        ) {
          overlay = parsed;
        }
      }
    } catch {
      // Invalid stored overlay. Start empty.
    }
    overlay.upserts["draft-companion"] = {
      slug: "draft-companion",
      title: "Draft Companion",
      price: 10,
      sold: false,
      alt: "",
      description: "",
      widthIn: "",
      heightIn: "",
      depthIn: "",
      medium: "",
      draft: true,
    };
    window.localStorage.setItem(key, JSON.stringify(overlay));
  });
  await page.goto("/admin/paintings/new");
  await page.locator("#de-title").fill("Practice Piece");
  await page.locator("#de-price").fill("999.99");
  await page
    .locator("#de-photo")
    .setInputFiles("src/content/paintings/1943x1967.jpg");
  await page.locator("#de-save-draft").click();
  // Saving returns to the dashboard with a confirmation,
  await expect(page).toHaveURL(/\/admin\/?$/);
  await expect(page.locator("#admin-status")).toContainText(
    'Draft "Practice Piece" kept',
    {
      timeout: 15_000,
    },
  );
  // and the Drafts fold appears with the practice row inside.
  await expect(page.locator("#edit-list")).toContainText(/drafts/i);
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
  // Toasts appear near the top, under the sticky header.
  const high = await toast.evaluate((el) => {
    const s = getComputedStyle(el);
    return { position: s.position, top: Number.parseFloat(s.top) };
  });
  expect(high.position).toBe("fixed");
  expect(high.top).toBeGreaterThan(60);
  expect(high.top).toBeLessThan(200);
  // The opacity fade runs despite reduced motion. Checked by class rather
  // than getAnimations, since the 0.25s animation can finish before the
  // read under CI load.
  await expect(toast).toHaveClass(/toast-in/);
  await expect(toast).toHaveCSS("animation-name", "toast-in");
  await expect(toast).toHaveCSS("animation-duration", "0.25s");
  // After six seconds it fades out.
  await page.clock.fastForward(6000);
  await expect(toast).toHaveClass(/toast-out/);
  await expect(toast).not.toBeEmpty();
  await page.clock.fastForward(1000);
  await expect(toast).toBeEmpty();
  // Errors appear in the same place, tinted red.
  await toast.evaluate((el) => {
    el.textContent = "Nope.";
    el.dataset.tone = "error";
  });
  const pos = await toast.evaluate((el) => {
    const s = getComputedStyle(el);
    return { position: s.position, top: s.top, bottom: s.bottom };
  });
  expect(pos.position).toBe("fixed");
  // Below the sticky header, not behind it. Check top, since Chrome
  // reports bottom as a used pixel value once top is set on a fixed box.
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
  // On desktop, drafts get their own fold below Available.
  await expect(async () => {
    const availBox = await page
      .locator('#edit-list .list-group[data-group="available"]')
      .boundingBox();
    const draftsBox = await page
      .locator('#edit-list .drafts-fold[data-group="drafts"]')
      .boundingBox();
    expect(availBox).not.toBe(null);
    expect(draftsBox).not.toBe(null);
    if (availBox === null || draftsBox === null) return;
    expect(draftsBox.y).toBeGreaterThan(availBox.y + availBox.height);
  }).toPass();
  const row = page.locator('.row-card:has-text("Doomed Piece")');
  await expect(row).toBeVisible();
  const del = row.locator(".row-del");
  const modal = page.locator("#row-confirm");
  const yes = page.locator("#row-confirm-yes");
  // Clicking opens the confirmation without deleting or navigating.
  await del.click();
  await expect(modal).toBeVisible();
  await expect(page.locator("#row-confirm-body")).toContainText("Doomed Piece");
  await expect(yes).toBeDisabled();
  await expect(yes).toHaveText(/Move to trash \(\d\)/);
  await expect(row).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/?$/);
  // "Keep it" cancels and leaves the row.
  await page.locator("#row-confirm-no").click();
  await expect(modal).toBeHidden();
  await expect(row).toBeVisible();
  // After 3.5 seconds the confirm button enables and works.
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
  // The toast clears, errors included.
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
  // Focus shows only the accent outline. The border doesn't change.
  await expect(title).toHaveCSS("outline-width", "2px");
  await expect(title).toHaveCSS("border-color", "rgb(229, 220, 203)");
  // The border has a transition in case it changes.
  const borderEase = await title.evaluate(
    (el) => getComputedStyle(el).transition,
  );
  expect(borderEase).toContain("border-color");
});

test("gallery link leaves admin and lands home", async ({ browser }) => {
  const authed = await browser.newContext();
  const page = await authed.newPage();
  await page.goto("/admin");
  // Set once with evaluate. addInitScript would re-run after leaving and
  // restore the token.
  await page.evaluate(() =>
    window.localStorage.setItem("ADMIN_API_TOKEN", "test"),
  );
  await page.reload();
  // Full text on desktop, arrow only on phones.
  await expect(page.locator("#leave-admin")).toContainText("Leave Admin");
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

test("scheduled drafts whose day has come publish themselves", async ({
  browser,
}) => {
  const authed = await browser.newContext();
  await authed.addInitScript(() =>
    sessionStorage.setItem("ADMIN_API_TOKEN", "test"),
  );
  const page = await authed.newPage();
  const { commits } = await stubPaintingFiles(page, {
    "soon.md": stubMd("Soon", `draft: true\npublishOn: "2000-01-01"\n`),
    "later.md": stubMd("Later", `draft: true\npublishOn: "2999-01-01"\n`),
  });
  await page.goto("/admin");
  // Loading the page publishes the due draft in one commit.
  await expect
    .poll(() => commits().at(-1)?.message ?? null, { timeout: 15_000 })
    .toBe('Publish scheduled painting: "Soon"');
  const published = commits().at(-1)?.blobs[0] ?? "";
  expect(published).toMatch(/^draft: false$/m);
  expect(published).not.toMatch(/^publishOn:/m);
  await expect(page.locator("#admin-status")).toContainText('Published "Soon"');
  // Soon is now available. Later stays a draft and shows its date.
  await expect(page.locator('[data-group="available"] .row-card')).toHaveCount(
    1,
  );
  await expect(page.locator('[data-group="drafts"] .row-card')).toHaveCount(1);
  await expect(page.locator('[data-group="drafts"] .row-card')).toContainText(
    "goes live 2999-01-01",
  );
  await authed.close();
});

test("qr codes page prints one card per published painting", async ({
  page,
}) => {
  await page.goto("/admin/qr-codes");
  await expect(
    page.locator(".site-nav").getByRole("link", { name: "QR codes" }),
  ).toHaveAttribute("aria-current", "page");
  // Every published painting gets a card with its buyer page URL. Drafts
  // get none.
  for (const p of paintings) {
    const card = page.locator(`.qr-card[id="${p.slug}"]`);
    await expect(card).toBeVisible();
    await expect(card.locator(".qr-code svg")).toBeAttached();
    await expect(card.locator(".qr-url")).toHaveText(
      `https://barbart.ca/paintings/${p.slug}`,
    );
  }
  await expect(page.locator("#qr-print")).toHaveText("Print codes");
  // Three cards across on desktop.
  const rows = await page
    .locator(".qr-card")
    .evaluateAll((els) =>
      els.slice(0, 3).map((el) => Math.round(el.getBoundingClientRect().top)),
    );
  expect(new Set(rows).size).toBe(1);
});

test("collection rows link published paintings to their qr card", async ({
  page,
}) => {
  await mockCommitApi(page);
  await page.goto("/admin");
  // Published rows link to their print card on the QR page.
  const qrLinks = page.locator(
    '[data-group="available"] .row-card .row-qr, [data-group="sold"] .row-card .row-qr',
  );
  expect(await qrLinks.count()).toBeGreaterThan(0);
  for (const p of paintings) {
    const link = page.locator(
      `#edit-list .row-qr[href="/admin/qr-codes#${p.slug}"]`,
    );
    if ((await link.count()) === 0) continue;
    await expect(link.first()).toHaveText("QR code");
  }
  // Drafts have no buyer page, so no code.
  await expect(
    page.locator('[data-group="drafts"] .row-card .row-qr'),
  ).toHaveCount(0);
  // Published rows show the mini code beside the link.
  const minis = page.locator(
    '[data-group="available"] .row-card .qr-mini svg, [data-group="sold"] .row-card .qr-mini svg',
  );
  expect(await minis.count()).toBeGreaterThan(0);
  // The mini code is icon-sized, with no background, in the accent color.
  const mini = page
    .locator('[data-group="available"] .row-card .qr-mini')
    .first();
  await expect(mini).toHaveCSS("width", "13px");
  await expect(mini).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const moduleFill = await mini
    .locator("svg path")
    .evaluate((el) => window.getComputedStyle(el).fill);
  expect(moduleFill).not.toBe("rgb(0, 0, 0)");
  expect(moduleFill).not.toBe("rgb(255, 255, 255)");
  await expect(
    page.locator('[data-group="drafts"] .row-card .qr-mini'),
  ).toHaveCount(0);
});

test("the QR mark itself opens its print card", async ({ page }) => {
  await mockCommitApi(page);
  await page.goto("/admin");
  const mark = page
    .locator('[data-group="available"] .row-card .qr-mini')
    .first();
  await expect(mark.locator("svg")).toBeAttached({ timeout: 15000 });
  // The code is inside the link, so tapping it navigates to the card.
  await mark.click();
  await expect(page).toHaveURL(/\/admin\/qr-codes\/#.+/);
});

test("qr cards print one code at a time", async ({ page }) => {
  // Stub print so no dialog opens. Count the call, then fire afterprint
  // manually.
  await page.addInitScript(() => {
    const w = window as unknown as { __prints?: number };
    w.__prints = 0;
    window.print = () => {
      w.__prints = (w.__prints ?? 0) + 1;
    };
  });
  await page.goto("/admin/qr-codes");
  const first = page.locator(".qr-card").first();
  await first.locator(".qr-print-one").click();
  expect(
    await page.evaluate(
      () => (window as unknown as { __prints?: number }).__prints,
    ),
  ).toBe(1);
  await expect(page.locator("#sec-qr")).toHaveClass(/printing-one/);
  await expect(first).toHaveClass(/print-this/);
  await expect(page.locator(".qr-card.print-this")).toHaveCount(1);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator("#sec-qr")).not.toHaveClass(/printing-one/);
  await expect(page.locator(".qr-card.print-this")).toHaveCount(0);
});

test("the old marketing page is gone", async ({ page }) => {
  // Marketing was split into Ping and Email, so the old URL is empty.
  await page.goto("/admin/marketing");
  await expect(page.locator("h1")).toHaveText("That wall is empty.");
});
