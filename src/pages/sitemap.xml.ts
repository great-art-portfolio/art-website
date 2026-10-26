import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { SITE_LOCALES } from "../i18n";
import { localeInfo, localePath } from "../i18n/locales";
import { isPublished, SITE_URL, slugifyTitle } from "../lib/site";

// Buyer-facing pages only: the gallery, privacy, and published paintings,
// in every language she has switched on. Each entry names its other
// languages, so search engines show people their own. Drafts, trash, and
// the studio are excluded. Listing new paintings here gets them indexed
// sooner than crawling.
export const GET: APIRoute = async () => {
  const paintings = (await getCollection("paintings")).filter((p) =>
    isPublished(p.data),
  );
  const day = (d: Date): string => d.toISOString().slice(0, 10);
  const pages = [
    { path: "/", lastmod: null as string | null },
    { path: "/privacy", lastmod: null as string | null },
    ...paintings.map((p) => ({
      path: `/paintings/${slugifyTitle(p.data.title)}`,
      lastmod: day(p.data.dateAdded),
    })),
  ];
  const url = (locale: (typeof SITE_LOCALES)[number], path: string): string =>
    new URL(localePath(locale, path), SITE_URL).href;
  const alternates = (path: string): string =>
    SITE_LOCALES.length < 2
      ? ""
      : SITE_LOCALES.map(
          (l) =>
            `<xhtml:link rel="alternate" hreflang="${localeInfo(l).lang}" href="${url(l, path)}"/>`,
        ).join("") +
        `<xhtml:link rel="alternate" hreflang="x-default" href="${url("en", path)}"/>`;
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    pages
      .flatMap((page) =>
        SITE_LOCALES.map(
          (locale) =>
            `  <url><loc>${url(locale, page.path)}</loc>` +
            (page.lastmod === null
              ? ""
              : `<lastmod>${page.lastmod}</lastmod>`) +
            alternates(page.path) +
            `</url>`,
        ),
      )
      .join("\n") +
    `\n</urlset>\n`;
  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
