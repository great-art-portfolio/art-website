import { expect, test } from "@playwright/test";
import {
  GALLERY_WIDTHS,
  PHOTO_WIDTHS,
  gallerySizes,
  photoSizes,
} from "../src/lib/responsive-images";

/**
 * Each painting photo serves several webp widths so phones get smaller
 * files. The first gallery image loads eagerly at high priority for LCP and
 * the rest lazy-load. The manifest includes 192, 512 and maskable icons.
 */

function widths(srcset: string | null): number[] {
  return (
    srcset
      ?.split(",")
      .map((part) => Number(part.trim().split(" ")[1]?.replace("w", "")))
      .filter((n) => Number.isFinite(n)) ?? []
  );
}

test("gallery cards serve responsive webp widths", async ({ page }) => {
  await page.goto("/");
  const cards = page.locator("#gallery-static .card img");
  expect(await cards.count()).toBeGreaterThan(0);
  for (let i = 0; i < (await cards.count()); i += 1) {
    const img = cards.nth(i);
    const srcset = await img.getAttribute("srcset");
    expect(widths(srcset)).toEqual(GALLERY_WIDTHS);
    for (const url of (srcset ?? "")
      .split(",")
      .map((p) => p.trim().split(" ")[0] ?? "")) {
      expect(url.endsWith(".webp")).toBe(true);
    }
    expect(await img.getAttribute("sizes")).toBe(gallerySizes());
    expect(await img.getAttribute("decoding")).toBe("async");
    // The featured painting up top is the one loaded first.
    expect(await img.getAttribute("loading")).toBe("lazy");
    expect(await img.getAttribute("fetchpriority")).toBeNull();
  }
  const hero = page.locator(".hero .feature img");
  await expect(hero).toHaveAttribute("loading", "eager");
  await expect(hero).toHaveAttribute("fetchpriority", "high");
});

test("painting photo serves responsive webp widths", async ({ page }) => {
  await page.goto("/paintings/night-reeds");
  const photo = page.locator("#photo-wrap img");
  expect(widths(await photo.getAttribute("srcset"))).toEqual(PHOTO_WIDTHS);
  expect(await photo.getAttribute("sizes")).toBe(photoSizes());
  expect(await photo.getAttribute("fetchpriority")).toBe("high");
  expect(await photo.getAttribute("decoding")).toBe("async");
});

test("manifest icons exist at installable sizes", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBeTruthy();
  const manifest = (await res.json()) as {
    icons: Array<{ src: string; sizes: string; purpose?: string }>;
  };
  const bySize: Record<string, string | undefined> = {};
  for (const icon of manifest.icons) bySize[icon.sizes] = icon.purpose;
  expect("192x192" in bySize).toBe(true);
  expect("512x512" in bySize).toBe(true);
  expect(Object.values(bySize)).toContain("maskable");
  for (const icon of manifest.icons) {
    const file = await request.get(icon.src);
    expect(file.ok()).toBeTruthy();
    expect((await file.body()).length).toBeGreaterThan(1000);
  }
});
