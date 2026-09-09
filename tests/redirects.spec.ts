import { expect, test } from "@playwright/test";

/**
 * Old dimension-named painting URLs (renamed Sep 2026) redirect to the
 * title slugs — bookmarks and shared links keep working.
 */
const redirects: Array<[string, string]> = [
  ["/paintings/1943x1967", "/paintings/first-thaw"],
  ["/paintings/2122x2118", "/paintings/night-reeds"],
  ["/paintings/2510x2478", "/paintings/indigo-tide"],
  ["/paintings/2769x2745", "/paintings/shoreline"],
  ["/paintings/IMG_5667", "/paintings/prairie-moon"],
];

for (const [from, to] of redirects) {
  test(`legacy URL ${from} redirects to ${to}`, async ({ request }) => {
    const res = await request.get(from, { maxRedirects: 0 });
    expect([301, 308]).toContain(res.status());
    expect(res.headers()["location"] ?? "").toContain(to);
  });
}

test("renamed studio Views page redirects to Metrics", async ({ request }) => {
  const res = await request.get("/admin/views", { maxRedirects: 0 });
  expect([301, 308]).toContain(res.status());
  expect(res.headers()["location"] ?? "").toContain("/admin/metrics");
});
