import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { isPublished, slugifyTitle } from "../lib/site";

// What checkout trusts: each published painting's title, price, and sold
// state as of this build. /api/checkout reads it through the static assets
// binding, so a browser can't name its own price. `file` is the .md the
// payment webhook marks sold.
export const GET: APIRoute = async () => {
  const paintings = (await getCollection("paintings")).filter((p) =>
    isPublished(p.data),
  );
  const items = paintings.map((p) => ({
    slug: slugifyTitle(p.data.title),
    title: p.data.title,
    priceCents: Math.round(p.data.price * 100),
    sold: p.data.sold,
    file: p.filePath ?? "",
  }));
  return new Response(JSON.stringify({ paintings: items }), {
    headers: { "content-type": "application/json" },
  });
};
