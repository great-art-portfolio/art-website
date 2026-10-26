import { expect, test } from "@playwright/test";

/** The site in other languages: each page has a copy per switched-on
 * language, search engines are told about every copy, visitors can switch,
 * and a browser in one of her languages is offered it once. */

test("the French homepage is in French and names every other copy", async ({
  page,
}) => {
  await page.goto("/fr");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.locator("h1")).toContainText("Des tableaux originaux");
  await expect(
    page.locator(".site-nav a[href='/fr#collection']"),
  ).toBeVisible();
  const alternates = page.locator("link[rel=alternate][hreflang]");
  expect(await alternates.count()).toBeGreaterThan(2);
  await expect(
    page.locator("link[rel=alternate][hreflang=x-default]"),
  ).toHaveAttribute("href", "https://barbart.ca/");
  // Cards link to the French painting pages.
  const card = page.locator("#gallery-static a.card").first();
  await expect(card).toHaveAttribute("href", /^\/fr\/paintings\//);
});

test("a translated painting page keeps her English title for inquiries", async ({
  page,
}) => {
  let posted: Record<string, unknown> = {};
  await page.route("**/api/inquiries", async (route) => {
    posted = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 201, json: { ok: true } });
  });
  await page.goto("/fr/paintings/prairie-moon");
  await expect(page.locator("h1")).toHaveText("Lune des prairies");
  await expect(page.locator(".machine-note")).toBeVisible();
  await expect(page.locator(".art-meta")).toContainText("cm (36 × 36");
  await page.getByRole("button", { name: "Ça vous intéresse ?" }).click();
  await page.locator('#inquiry-form input[name="name"]').fill("Camille");
  await page
    .locator('#inquiry-form input[name="email"]')
    .fill("camille@resend.dev");
  await page.locator('#inquiry-form button[type="submit"]').click();
  await expect(page.locator("#inquiry-status")).toContainText("Merci");
  expect(posted["paintingTitle"]).toBe("Prairie Moon");
  expect(posted["locale"]).toBe("fr");
});

test("the language menu goes to the same painting in another language", async ({
  page,
}) => {
  await page.goto("/paintings/prairie-moon");
  const menu = page.locator(".lang-menu");
  await expect(menu.locator("a[aria-current]")).toHaveText("English");
  await menu.getByRole("link", { name: "日本語" }).click();
  await expect(page).toHaveURL(/\/ja\/paintings\/prairie-moon$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
});

test.describe("a Spanish-speaking browser", () => {
  test.use({ locale: "es-MX" });

  test("is offered Spanish once, and No thanks sticks", async ({ page }) => {
    await page.goto("/");
    const offer = page.locator("#lang-offer");
    await expect(offer).toBeVisible();
    await expect(page.locator("#lang-offer-go")).toHaveText(
      "Leer este sitio en español →",
    );
    await expect(page.locator("#lang-offer-go")).toHaveAttribute("href", "/es");
    await page.locator("#lang-offer-no").click();
    await expect(offer).toBeHidden();
    await page.reload();
    await expect(page.locator("#lang-offer")).toBeHidden();
  });

  test("isn't offered Spanish on the Spanish page", async ({ page }) => {
    await page.goto("/es");
    await expect(page.locator("#lang-offer")).toBeHidden();
  });
});

test("an English browser isn't offered anything", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".lang-menu")).toBeVisible();
  await expect(page.locator("#lang-offer")).toBeHidden();
});

test("the sign-up box speaks the page's language", async ({ page }) => {
  await page.goto("/de");
  await page.locator("#notify-nav").click();
  await expect(page.locator("#notify-dialog-title")).not.toHaveText(
    "Never miss a new painting",
  );
  await page.locator("#notify-email").fill("a@b");
  await page.locator("#notify-email-form button[type=submit]").click();
  await expect(page.locator("#notify-status")).not.toContainText(
    "doesn't look right",
  );
  await expect(page.locator("#notify-status")).not.toHaveText("");
});
