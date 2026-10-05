import { getCollection, type CollectionEntry } from "astro:content";
import { pickFeatured } from "./gallery-layout";
import { compareGalleryOrder, isPublished } from "./site";

/** Published paintings for the public pages, split and sorted the same
 * way everywhere. Astro-only: node tests can't load astro:content. */
export type Painting = CollectionEntry<"paintings">;

const byGalleryOrder = (a: Painting, b: Painting): number =>
  compareGalleryOrder(
    { order: a.data.order ?? null, title: a.data.title },
    { order: b.data.order ?? null, title: b.data.title },
  );

export async function publicPaintings(): Promise<{
  available: Painting[];
  sold: Painting[];
  /** The newest available painting, hung beside the homepage headline. */
  featured: Painting | undefined;
}> {
  const paintings = (await getCollection("paintings")).filter((p) =>
    isPublished(p.data),
  );
  // Sorted by the /admin drag order (`order:`), then alphabetically.
  const available = paintings.filter((p) => !p.data.sold).sort(byGalleryOrder);
  const sold = paintings.filter((p) => p.data.sold).sort(byGalleryOrder);
  const featured = available[pickFeatured(available.map((p) => p.data))];
  return { available, sold, featured };
}
