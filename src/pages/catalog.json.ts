import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { getImage } from "astro:assets";
import { SHARE_IMAGE } from "../lib/share-image";
import { isPublished, slugifyTitle } from "../lib/site";

// What checkout trusts: each published painting's title, price, and sold
// state as of this build. /api/checkout reads it through the static assets
// binding, so a browser can't name its own price. `file` is the .md the
// payment webhook marks sold. `image` is the share copy the new-painting
// email shows, through /api/painting-image. Descriptions and dates teach
// the writing helper her voice (they're on the public pages anyway).
export const GET: APIRoute = async () => {
  const paintings = (await getCollection("paintings")).filter((p) =>
    isPublished(p.data),
  );
  const items = await Promise.all(
    paintings.map(async (p) => ({
      slug: slugifyTitle(p.data.title),
      title: p.data.title,
      priceCents: Math.round(p.data.price * 100),
      sold: p.data.sold,
      file: p.filePath ?? "",
      image: (await getImage({ src: p.data.image, ...SHARE_IMAGE })).src,
      description: (p.body ?? "").trim(),
      added: p.data.dateAdded.toISOString().slice(0, 10),
      // Earlier slugs, so a page left open from before a rename still
      // finds its painting.
      aliases: (p.data.slugHistory ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s !== ""),
    })),
  );
  return new Response(JSON.stringify({ paintings: items }), {
    headers: { "content-type": "application/json" },
  });
};
