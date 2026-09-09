import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const paintings = defineCollection({
  // Load all .md files in src/content/paintings/
  loader: glob({ pattern: "**/*.md", base: "./src/content/paintings" }),
  // define the schema for each .md file
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      dateAdded: z.date(),
      image: image(), // Validates and imports the image as an asset
      alt: z.string(),
      sold: z.boolean(),
      price: z.number().positive(),
      // Gallery position, set by dragging Available rows on /admin.
      // Absent = unordered (trails alphabetically, see compareGalleryOrder).
      order: z.number().int().optional(),
      // Physical measurements in inches — optional until Barbara measures each
      // piece. Powers the "24 × 36 in" labels, grid scale cues, and AR true-size.
      widthIn: z.number().positive().optional(),
      heightIn: z.number().positive().optional(),
      depthIn: z.number().positive().optional(),
      // Studio drafts: saved but not yet published. Hidden from the gallery,
      // painting pages, and search engines until the draft flag comes off.
      draft: z.boolean().optional(),
      // Scheduled go-live ("YYYY-MM-DD", quoted like trashedAt — a bare
      // date parses as a Date object and fails this schema at build).
      // The dashboard publishes due drafts on her next visit, one commit.
      publishOn: z.string().optional(),
      // Old page links after a rename ("a, b", quoted). The buyer page
      // builds one alias path per entry, canonical back to the title.
      slugHistory: z.string().optional(),
      // Studio trash: deleted paintings rest here 30 days (restorable)
      // before clearing themselves. Hidden everywhere, like drafts.
      // The stamp is a quoted string (like title), never a bare date.
      trash: z.boolean().optional(),
      trashedAt: z.string().optional(),
      medium: z.string().optional(),
      // "View on your wall" AR models, built once in /admin and committed to
      // public/models. Absent = no AR section on the page.
      modelGlb: z.string().optional(),
      modelUsdz: z.string().optional(),
    }),
});

export const collections = { paintings };
