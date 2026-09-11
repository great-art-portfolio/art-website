import { expect, test, type Page } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { slugifyTitle } from "../src/lib/site";

/** Admin studio journey from /admin — no URLs to remember, zero admin chrome
 * signed out. Live delete only reaches the confirm arm; dev-list deletes run
 * fully against an in-memory copy. */

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

/**
 * File-backed commit stub with live state: commits rewrite files, deletes
 * remove them — so trash, restore, empty, and auto-clear all re-read the
 * world they just wrote, exactly like the real backend.
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

/** Minimal stub frontmatter; extra lines (trash flags) ride along. */
function stubMd(title: string, extra = ""): string {
  return (
    `---\ntitle: "${title}"\nprice: 100\nsold: false\n` +
    `${extra}---\n\nBody.\n`
  );
}

test("studio header links home, never to visitor funnels", async ({ page }) => {
  await mockCommitApi(page);
  await page.goto("/admin");
  // One nav: seven sections, ← Leave Admin, Add painting. Leave doubles
  // as logout (clears the token). View counts live inside the
  // collection rows themselves, so the nav carries no metrics link.
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
    `#edit-list a.row-title[href="/paintings/${paintings[0]?.slug ?? ""}"]`,
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
    new RegExp(`/paintings/${paintings[0]?.slug ?? ""}/?$`),
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
  // Same clay in both computed-color serializations (rgb vs P3).
  expect(color).toMatch(/164, 74, 36|0\.622 0\.289 0\.133/);
});

test("studio hovers match the footer: underline only, no color flash", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/admin");
  // Dark clay in both computed-color serializations (rgb vs P3).
  const accent = /208, 129, 89|0\.795 0\.506 0\.342/;
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
    /164, 74, 36|0\.622 0\.289 0\.133/,
  );
});

test("collection rows stop well short of the content edge on desktop", async ({
  page,
}) => {
  await page.goto("/admin");
  const list = page.locator("#edit-list");
  await expect(list).toBeVisible();
  // Rows arrive as static markup — no skeleton flash, no layout shift.
  await expect(page.locator("#edit-list .row-card").first()).toBeVisible();
  await expect(page.locator("#edit-list .skel")).toHaveCount(0);
  // Available fills the whole content width — no empty half. The Drafts
  // and Sold folds stack below it as full-width rows, not side columns.
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

test("drafts fold away between available and sold", async ({ page }) => {
  // Seeded drafts, not tree files — a clean checkout has no drafts.
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
        },
        deletes: [],
      }),
    );
  });
  await page.goto("/admin");
  const fold = page.locator("#edit-list .drafts-fold");
  await expect(fold).toBeVisible();
  await expect(fold.locator("summary")).toContainText(/drafts$/);
  // Full-width row below Available and above Sold — never a side column.
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
  // The dashboard wires dragging after its first collection pass — a
  // native drag before that is just a link drag, so wait for the flag.
  await expect(cards.first()).toHaveAttribute("draggable", "true", {
    timeout: 15_000,
  });
  const n = await cards.count();
  expect(n).toBeGreaterThan(1);
  const before = await cards.locator(".row-title").allTextContents();
  const first = cards.nth(0);
  const last = cards.nth(n - 1);
  const firstMd = await first.locator(".row-del").getAttribute("data-md");
  // Drop onto the last card's center: the dragged card lands before it.
  // (dragTo drives a real native drag; manual mouse steps never
  // dispatch drop in this Chromium.)
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
  // Reads go through the closure: assigning the untyped post body
  // inside the route narrows direct reads to never.
  const sent = (): typeof posted => posted;
  await mockCommitApi(page);
  // Registered after the mock so POST lands here first; everything else
  // falls back through to it.
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
  // Only rows that actually moved rewrite: the last card never budges,
  // so n-1 files commit (unchanged rows are skipped, not rewritten).
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
  // The dashboard mirrors the drop: first card now sits just before last.
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
  // Three sold paintings through the commit API — the tree only holds one,
  // and dragging needs a group to reorder within.
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
  // Reads go through the closure: assigning the untyped post body
  // inside the route narrows direct reads to never.
  const sent = (): typeof posted => posted;
  // Registered after the stub so POST lands here first; everything else
  // falls back through to it.
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
  // The moved painting's file carries its new index…
  const moved = sent()?.files.find((f) => f.path === firstMd);
  expect(moved).not.toBe(undefined);
  const body = Buffer.from(moved?.contentBase64 ?? "", "base64").toString(
    "utf8",
  );
  const at = Number(body.match(/^order: (\d+)$/m)?.[1] ?? "-1");
  expect(at).toBeGreaterThanOrEqual(0);
  await expect(page.locator("#admin-status")).toContainText("Sold order saved");
  // …and the dashboard shows it there.
  const after = await titles.allTextContents();
  expect(after).not.toEqual(before);
  expect(after[at]).toBe(before[0]);
  await authed.close();
});

test("switching studio sections fades the page", async ({ page }) => {
  await page.goto("/admin");
  // Click through the header, then sample 30ms into the 220ms arrival
  // fade: an animation must be running on the fresh page.
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
  // A held press closes the fist — released anywhere, no commit.
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
  // Delete asks first, then moves to trash — nothing destroyed.
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
  // Restore brings it straight back, no questions.
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
  // Delete forever asks again, then destroys the files.
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
  // The fold rests closed until she opens it.
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
  // No clicks: the visit itself clears the old trash in one commit.
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
  // No token on a local preview: the practice overlay, never a commit.
  await mockCommitApi(page);
  await page.goto("/admin");
  const { n, before } = await dragFirstOntoLast(page);
  await expect(page.locator("#admin-status")).toContainText(
    "kept in this tab",
    {
      timeout: 15_000,
    },
  );
  // Same mirror in practice mode: the list shows the dropped order.
  // Polled like the live test — the re-render lands a beat after the
  // drop, and a bare expect would compare the Promise itself.
  await expect
    .poll(
      () =>
        page
          .locator('[data-group="available"] .row-card .row-title')
          .allTextContents(),
      { timeout: 15_000 },
    )
    .toEqual([...before.slice(1, n - 1), before[0], before[n - 1]]);
  // Resting on an Available photo reveals the reorder hint — not
  // instantly (it would nag on every pass), only after a few seconds.
  await page.locator('[data-group="available"] .row-photo').first().hover();
  await page.waitForTimeout(1000);
  await expect(page.locator("#reorder-tip")).toBeHidden();
  await expect(page.locator("#reorder-tip")).toBeVisible({ timeout: 15000 });
  await expect(page.locator("#reorder-tip")).toContainText(
    "Drag cards to reorder",
  );
  // Leaving hides it again.
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
  // Same skip-unchanged contract as the live commit above: the unmoved
  // last card keeps its order, so n-1 rows land in the overlay, each
  // with a distinct position.
  expect(orders.length).toBe(n - 1);
  expect(new Set(orders).size).toBe(n - 1);
});

test("dropping a card where it already sits stays silent", async ({ page }) => {
  // Second-to-last onto the last card's center: already just before
  // it, so the drop is a positional no-op — it used to toast
  // "already the order" on every such miss. No token on a local
  // preview: the practice overlay, never a commit.
  await mockCommitApi(page);
  await page.goto("/admin");
  const cards = page.locator('[data-group="available"] .row-card');
  await expect(cards.first()).toHaveAttribute("draggable", "true", {
    timeout: 15_000,
  });
  const n = await cards.count();
  expect(n).toBeGreaterThan(1);
  const before = await cards.locator(".row-title").allTextContents();
  // Immediate reads, never toBeEmpty: the retrying assertion would
  // out-wait the 6s toast and pass against the noisy code too.
  expect(await page.locator("#admin-status").textContent()).toBe("");
  await cards.nth(n - 2).dragTo(cards.nth(n - 1));
  // A beat for any commit or toast to appear — neither should.
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
  // Seeded draft, not tree files — a clean checkout holds no drafts.
  // No API stub here, so the dashboard falls back to its baked list and
  // merges the overlay, draft included.
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
  // Drafts don't drag, so resting on one must never summon the hint —
  // even past the few-seconds delay.
  await page.locator('[data-group="drafts"] .row-card').first().hover();
  await page.waitForTimeout(3600);
  await expect(page.locator("#reorder-tip")).toBeHidden();
});

test("delete warms to clay red, never brand orange", async ({ page }) => {
  await page.goto("/admin");
  const del = page.locator("#edit-list .row-del").first();
  await expect(del).toBeVisible();
  // The ease is on the color itself, not just the end state.
  const ease = await del.evaluate((el) => getComputedStyle(el).transition);
  expect(ease).toContain("color");
  // Re-hover inside the poll: under parallel load a late image can
  // shift the button mid-transition and drop the hover — the assertion
  // (clay, not brand orange) is unchanged.
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
  // The Advanced Settings heading stands clear of the lines above it.
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
  // Sample the footer through the close: past the 350ms flight every
  // step must be still. The old close eased 16px short, then snapped.
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
  // The unfold is script-driven (Web Animations), not the Chromium-only
  // interpolate-size slide — spy Element.animate to prove the script
  // owns it, on the guide drawer and a collection fold alike.
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
  await page.goto("/admin/metrics");
  // Most opened tops the ranking, with its count and the headline
  // total above the rows.
  const rows = page.locator("#stats-body .metric-row");
  await expect(rows.first()).toContainText("First Thaw");
  await expect(rows.first()).toContainText("10 views");
  await expect(rows.nth(1)).toContainText("Prairie Moon");
  await expect(rows.first().locator(".metric-thumb")).toBeVisible();
  await expect(page.locator("#stats-total")).toHaveText("17");
  // Every live painting has a row with its status (drafts never
  // opened for a buyer, so they stay off this table).
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
  // Far right of the title's *words*, level with them: the link hugs
  // its text (its own box stretches the column, so measure the text
  // range instead), and neither hover nor a click reaches it from
  // empty space.
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
  // On the words themselves, hover answers as before.
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
  // Titles still list — only the counts wait.
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
  // The anchor strip is gone; one section per page, reached through
  // the single header nav.
  await expect(page.locator(".subnav")).toHaveCount(0);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  // The collection list is the first thing a phone shows — the single
  // header nav fits beside it without scrolling sideways.
  await expect(page.locator("#edit-list")).toBeVisible();
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
  await page.goto("/admin/banner");
  const values = await page
    .locator("#f-duration option")
    .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));
  expect(values).toEqual(["", "1", "3", "7", "14"]);
  // Show-until, Update, and Remove share one desktop row (bottoms
  // level); the status sits below all three — and fades in instead of
  // snapping. Remove hides when no banner exists, so only the visible
  // controls pin the row.
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
  // Hugs the left, never the full column.
  const btnBox = await btn.boundingBox();
  const secBox = await page.locator("#sec-tickle").boundingBox();
  expect(btnBox !== null && secBox !== null).toBe(true);
  if (btnBox !== null && secBox !== null) {
    expect(btnBox.width).toBeLessThan(secBox.width / 2);
  }
  // Keyless there are no subscribers: the honest empty result, faded in.
  await btn.click();
  const status = page.locator("#tickle-status");
  await expect(status).toContainText("Nobody to ping yet");
  await expect(status).toHaveClass(/fade-in/);
  await expect(btn).toBeEnabled();
  // A custom line rides along and is stored for the ping to show.
  await page.locator("#tickle-body").fill("New seascape just listed");
  await btn.click();
  // Every tap answers at once, so this result can't be the first tap's
  // leftover text — wait out this tap's own cycle.
  await expect(status).toContainText("Pinging");
  await expect(status).toContainText("Nobody to ping yet");
  const stored = await page.request.get("/api/push-message");
  expect(await stored.json()).toEqual({ body: "New seascape just listed" });
});

test("ping preview wears the notification shape live", async ({ page }) => {
  await page.goto("/admin/ping");
  const preview = page.locator("#tickle-preview");
  await expect(preview).toBeVisible();
  // Her icon, the fixed title, the standard note while blank.
  await expect(preview.locator("img")).toHaveAttribute("src", "/favicon.png");
  await expect(preview.locator("strong")).toHaveText(
    "Something new in the gallery",
  );
  await expect(preview.locator("#tickle-preview-body")).toHaveText(
    "Tap to see it.",
  );
  // Typing swaps in her line — the exact words buyers get.
  await page.locator("#tickle-body").fill("New seascape just listed");
  await expect(preview.locator("#tickle-preview-body")).toHaveText(
    "New seascape just listed",
  );
  await page.locator("#tickle-body").fill("");
  await expect(preview.locator("#tickle-preview-body")).toHaveText(
    "Tap to see it.",
  );
});

test("device preview sends a local ping, never a broadcast", async ({
  page,
}) => {
  // Stand in for the OS renderer: records what would pop up.
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
  await page.locator("#tickle-body").fill("New seascape just listed");
  await page.locator("#tickle-preview-send").click();
  // The page says the ping went out on this browser only.
  await expect(page.locator("#tickle-status")).toContainText("Preview sent");
  // And it wears the real ping's shape: fixed title, her line, her icon.
  const shown = await page.evaluate(
    () => (window as unknown as Record<string, unknown>)["__notes"],
  );
  expect(shown).toEqual([
    {
      title: "Something new in the gallery",
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
  // The field names the default note — blank never surprises.
  await expect(page.locator("#tickle-body")).toHaveAttribute(
    "placeholder",
    "Blank: Something new in the gallery — tap to see it",
  );
  // Five subscribed browsers: the button must ask before it pings.
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
  // Saying no sends nothing — still idle, button back.
  await btn.click();
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0]).toBe("This will ping 5 browsers. Are you sure?");
  await expect(status).toBeEmpty();
  await expect(btn).toBeEnabled();
  // Saying yes pings all five.
  await btn.click();
  await expect.poll(() => asked.length).toBe(2);
  await expect(status).toContainText("Pinged 5 of 5 browsers.");
  await expect(btn).toBeEnabled();
});

test("tickle walks big lists in batches", async ({ page }) => {
  await page.goto("/admin/ping");
  // 65 subscribed browsers: one Worker call can't ping them all.
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
  // Two taps behind the scenes — 40 then 25 — one result on screen.
  await expect.poll(() => posts.length).toBe(2);
  expect(posts).toEqual([0, 40]);
  await expect(status).toContainText("Pinged 65 of 65 browsers.");
  await expect(btn).toBeEnabled();
});

test("send email button confirms the list before broadcasting", async ({
  page,
}) => {
  await page.goto("/admin/email");
  // Three addresses on the list: the button must ask before it sends.
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
  // Saying no sends nothing — still idle, button back.
  await btn.click();
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0]).toBe("This will email 3 subscribers. Are you sure?");
  await expect(status).toBeEmpty();
  await expect(btn).toBeEnabled();
  // Saying yes emails all three.
  await btn.click();
  await expect.poll(() => asked.length).toBe(2);
  await expect(status).toContainText("Emailed 3 subscribers.");
  await expect(btn).toBeEnabled();
});

test("send email asks even when the count didn't load", async ({ page }) => {
  // The count request fails, so the button asks blind rather than
  // sending blind — saying no sends nothing.
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
    // Echo her draft fields the way the server composes them.
    const params = new URL(route.request().url()).searchParams;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        total: 1,
        emailSubject: params.get("subject") ?? "",
        emailText: params.get("body") ?? "",
      }),
    });
  });
  await page.goto("/admin/email");
  // Both fields start as the standard note.
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
  const previewBody = page.locator("#email-preview-body");
  await expect(previewBody).toContainText("come look");
  // Her words land in the preview as she types, and ride the send.
  await page.locator("#email-body").fill("Fresh off the easel");
  await expect(previewBody).toContainText("Fresh off the easel");
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
  // Same clay in both computed-color serializations (rgb vs P3).
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
  // …and the Drafts fold appears (count label, like the sold fold),
  // practice row inside.
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
  // All news rides high, under the sticky header — nothing hides low.
  const high = await toast.evaluate((el) => {
    const s = getComputedStyle(el);
    return { position: s.position, top: Number.parseFloat(s.top) };
  });
  expect(high.position).toBe("fixed");
  expect(high.top).toBeGreaterThan(60);
  expect(high.top).toBeLessThan(200);
  // Opacity-only fade runs despite reduced motion. Pinned by name,
  // not by a live getAnimations count — the 0.25s run finishes
  // between round-trips under CI load, so an instant read flakes 0.
  await expect(toast).toHaveClass(/toast-in/);
  await expect(toast).toHaveCSS("animation-name", "toast-in");
  await expect(toast).toHaveCSS("animation-duration", "0.25s");
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
  // Drafts get their own foldable row below Available on desktop.
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
  // One tap opens the question — nothing deleted, nowhere navigated.
  await del.click();
  await expect(modal).toBeVisible();
  await expect(page.locator("#row-confirm-body")).toContainText("Doomed Piece");
  await expect(yes).toBeDisabled();
  await expect(yes).toHaveText(/Move to trash \(\d\)/);
  await expect(row).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/?$/);
  // "Keep it" backs out with the row untouched.
  await page.locator("#row-confirm-no").click();
  await expect(modal).toBeHidden();
  await expect(row).toBeVisible();
  // After 3.5 seconds of reading time, MOVE TO TRASH arms and fires.
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
  // Full words on desktop, arrow-only on phones — either way it reads
  // as leaving.
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
  // No clicks: the visit itself publishes the due draft in one commit.
  await expect
    .poll(() => commits().at(-1)?.message ?? null, { timeout: 15_000 })
    .toBe('Publish scheduled painting: "Soon"');
  const published = commits().at(-1)?.blobs[0] ?? "";
  expect(published).toMatch(/^draft: false$/m);
  expect(published).not.toMatch(/^publishOn:/m);
  await expect(page.locator("#admin-status")).toContainText('Published "Soon"');
  // Soon reads as available; Later stays a draft and says when it goes live.
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
  // Every published painting gets a card whose address is its live buyer
  // page — drafts have no page, so they get no card.
  for (const p of paintings) {
    const card = page.locator(`.qr-card[id="${p.slug}"]`);
    await expect(card).toBeVisible();
    await expect(card.locator(".qr-code svg")).toBeAttached();
    await expect(card.locator(".qr-url")).toHaveText(
      `https://barbart.ca/paintings/${p.slug}`,
    );
  }
  await expect(page.locator("#qr-print")).toHaveText("Print codes");
  // Desktop lays the cards three across.
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
  // Published rows carry a QR code link to their anchored print card.
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
  // Drafts have no buyer page and no code to print.
  await expect(
    page.locator('[data-group="drafts"] .row-card .row-qr'),
  ).toHaveCount(0);
  // Published rows wear the actual mini code beside the link.
  const minis = page.locator(
    '[data-group="available"] .row-card .qr-mini svg, [data-group="sold"] .row-card .qr-mini svg',
  );
  expect(await minis.count()).toBeGreaterThan(0);
  await expect(
    page.locator('[data-group="drafts"] .row-card .qr-mini'),
  ).toHaveCount(0);
});

test("qr cards print one code at a time", async ({ page }) => {
  // The print dialog never opens under test — count the call, then run
  // the afterprint cleanup by hand.
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
  // Ping and email split it in two — the old address reads empty.
  await page.goto("/admin/marketing");
  await expect(page.locator("h1")).toHaveText("That wall is empty.");
});
