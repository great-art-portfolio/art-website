import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const paintings = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/paintings" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      dateAdded: z.date(),
      image: image(), // Validates and imports the image as an asset
      alt: z.string(),
      sold: z.boolean(),
      price: z.number().positive(),
      // Gallery position, set by dragging rows on /admin. Unordered
      // paintings sort after ordered ones, alphabetically.
      order: z.number().int().optional(),
      // Physical size in inches, optional until measured. Used for the
      // "24 × 36 in" labels, grid scale, and true-size AR.
      widthIn: z.number().positive().optional(),
      heightIn: z.number().positive().optional(),
      depthIn: z.number().positive().optional(),
      // Saved but unpublished. Hidden from the gallery, painting pages, and
      // search engines.
      draft: z.boolean().optional(),
      // Scheduled publish date as a quoted "YYYY-MM-DD". A bare date parses
      // as a Date and fails this schema. The dashboard publishes due drafts
      // the next time it loads.
      publishOn: z.string().optional(),
      // Previous slugs after renames, as a quoted "a, b" list. Each gets an
      // alias page with a canonical link to the current slug.
      slugHistory: z.string().optional(),
      // Trashed paintings are hidden like drafts and can be restored for
      // 30 days before they're deleted. trashedAt is a quoted date string.
      trash: z.boolean().optional(),
      trashedAt: z.string().optional(),
      medium: z.string().optional(),
      // "View on your wall" AR models, built in /admin and committed to
      // public/models. Without them the page has no AR section.
      modelGlb: z.string().optional(),
      modelUsdz: z.string().optional(),
    }),
});

export const collections = { paintings };
