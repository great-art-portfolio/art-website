import { expect, test } from "@playwright/test";

/** Search engines meet published work here — never drafts or the studio. */

test("sitemap lists published paintings with the live domain", async ({
  request,
}) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);
  const xml = await res.text();
  expect(xml).toContain("https://barbart.ca/paintings/first-thaw");
  expect(xml).toContain("https://barbart.ca/");
  expect(xml).not.toContain("localhost");
  expect(xml).not.toContain("/admin");
  // Drafts stay out (the tree holds unpublished ones locally).
  expect(xml).not.toContain("1-copy");
});

test("robots points at the sitemap and keeps the studio out", async ({
  request,
}) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);
  const txt = await res.text();
  expect(txt).toContain("Sitemap: https://barbart.ca/sitemap.xml");
  expect(txt).toContain("Disallow: /admin/");
});

test("buyer pages share the painting, not the site icon", async ({ page }) => {
  await page.goto("/paintings/first-thaw");
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    "content",
    "https://barbart.ca/paintings/first-thaw",
  );
  const image = await page
    .locator('meta[property="og:image"]')
    .getAttribute("content");
  expect(image?.startsWith("https://barbart.ca/")).toBe(true);
  expect(image).not.toContain("apple-touch-icon");
  expect(image).not.toContain("localhost");
});
