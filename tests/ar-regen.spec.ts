import { expect, test, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Dimension-fix regeneration e2e: editing W/H/D rebuilds the AR models
 * from the repo photo inside the same commit. The commit POST is
 * intercepted and its payload asserted — nothing here can publish.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const mdPath = "src/content/paintings/1943x1967.md";
const localMd = readFileSync(join(repoRoot, mdPath), "utf8");
const localJpg = readFileSync(join(repoRoot, "src", "content", "paintings", "1943x1967.jpg"));

interface PostedFile {
  path: string;
  contentBase64: string;
}
interface Posted {
  message: string;
  files: PostedFile[];
}

function mdBody(posted: Posted | null, path: string): string {
  const file = posted?.files.find((f) => f.path === path);
  expect(file).toBeDefined();
  return Buffer.from(file?.contentBase64 ?? "", "base64").toString("utf8");
}

async function authedPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  await context.addInitScript(() => sessionStorage.setItem("ADMIN_API_TOKEN", "test"));
  return context.newPage();
}

/** Intercept every API call: reads served locally, commits captured. */
async function stubApi(page: Page): Promise<{ posted: () => Posted | null }> {
  let posted: Posted | null = null;
  await page.route("**/api/commit*", async (route) => {
    const method = route.request().method();
    if (method === "POST") {
      posted = route.request().postDataJSON() as Posted;
      await route.fulfill({ json: { ok: true, commit: "test" }, status: 201 });
    } else if (method === "PUT") {
      await route.fulfill({ json: { files: ["1943x1967.md"] } });
    } else if (route.request().url().includes("path=")) {
      await route.fulfill({ json: { content: localMd } });
    } else {
      await route.fulfill({ json: { announcement: "" } });
    }
  });
  await page.route("**/api/photo*", async (route) => {
    await route.fulfill({ contentType: "image/jpeg", body: localJpg });
  });
  await page.route("**/api/status", async (route) => {
    await route.fulfill({
      json: { stripe: false, shippo: false, socialPost: false, email: false, push: false },
    });
  });
  return { posted: () => posted };
}

test("in-context dimension fix rebuilds AR in the same commit", async ({
  browser,
}) => {
  const page = await authedPage(browser);
  const api = await stubApi(page);

  await page.goto("/paintings/first-thaw");
  await page.locator("#admin-edit-toggle").click();
  const panel = page.locator("#admin-edit");
  await expect(panel.locator("#ae-title")).toHaveValue("First Thaw", {
    timeout: 15_000,
  });
  await panel.locator("#ae-w").fill("21");
  await panel.locator("#ae-save").click();
  await expect(panel.locator("#ae-status")).toHaveText("Saved.", {
    timeout: 30_000,
  });

  const posted = api.posted();
  expect(posted?.message).toBe("Edit painting: First Thaw");
  expect(posted?.files.map((f) => f.path).sort()).toEqual(
    [mdPath, "public/models/1943x1967.glb", "public/models/1943x1967.usdz"].sort(),
  );
  const md = mdBody(posted, mdPath);
  expect(md).toMatch(/^widthIn: 21$/m);
  expect(md).toMatch(/^modelGlb: "\/models\/1943x1967\.glb"$/m);
  for (const modelPath of [
    "public/models/1943x1967.glb",
    "public/models/1943x1967.usdz",
  ]) {
    const blob = posted?.files.find((f) => f.path === modelPath);
    expect((blob?.contentBase64.length ?? 0) > 10_000).toBe(true);
  }
  await page.context().close();
});

test("in-context save without dimension changes commits only the .md", async ({
  browser,
}) => {
  const page = await authedPage(browser);
  const api = await stubApi(page);

  await page.goto("/paintings/first-thaw");
  await page.locator("#admin-edit-toggle").click();
  const panel = page.locator("#admin-edit");
  await expect(panel.locator("#ae-title")).toHaveValue("First Thaw", {
    timeout: 15_000,
  });
  await panel.locator("#ae-save").click();
  await expect(panel.locator("#ae-status")).toHaveText("Saved.", {
    timeout: 30_000,
  });

  const posted = api.posted();
  expect(posted?.files.map((f) => f.path)).toEqual([mdPath]);
  await page.context().close();
});

test("studio collection dimension fix rebuilds AR in the same commit", async ({
  browser,
}) => {
  const page = await authedPage(browser);
  const api = await stubApi(page);

  await page.goto("/admin");
  const row = page.locator("#edit-list li", { hasText: "First Thaw" });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.locator('button[data-edit]').click();
  const list = page.locator("#edit-list");
  await expect(list.locator("#ed-w")).toBeVisible({ timeout: 15_000 });
  await list.locator("#ed-w").fill("22");
  await list.locator("#ed-save").click();
  await expect(page.locator("#admin-status")).toContainText('Saved "First Thaw".', {
    timeout: 30_000,
  });

  const posted = api.posted();
  expect(posted?.files.map((f) => f.path).sort()).toEqual(
    [mdPath, "public/models/1943x1967.glb", "public/models/1943x1967.usdz"].sort(),
  );
  expect(mdBody(posted, mdPath)).toMatch(/^widthIn: 22$/m);
  await page.context().close();
});
