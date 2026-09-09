import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { isPublished, SITE_URL, slugifyTitle } from "../lib/site";

// Buyer-facing pages only: the gallery, privacy, and every published
// painting (drafts, trash, and the studio never list). Search engines
// meet new work here days before plain crawling would find it.
export const GET: APIRoute = async () => {
  const paintings = (await getCollection("paintings")).filter((p) =>
    isPublished(p.data),
  );
  const day = (d: Date): string => d.toISOString().slice(0, 10);
  const entries = [
    { loc: `${SITE_URL}/`, lastmod: null as string | null },
    { loc: `${SITE_URL}/privacy`, lastmod: null as string | null },
    ...paintings.map((p) => ({
      loc: `${SITE_URL}/paintings/${slugifyTitle(p.data.title)}`,
      lastmod: day(p.data.dateAdded),
    })),
  ];
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    entries
      .map(
        (e) =>
          `  <url><loc>${e.loc}</loc>` +
          (e.lastmod === null ? "" : `<lastmod>${e.lastmod}</lastmod>`) +
          `</url>`,
      )
      .join("\n") +
    `\n</urlset>\n`;
  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
