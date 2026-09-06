import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const paintings = defineCollection({
  // Load all .md files in src/content/paintings/
  loader: glob({ pattern: "**/*.md", base: "./src/content/paintings" }),
  // define the schema for each .md file
  schema: ({ image }) => z.object({
    title: z.string(),
    dateAdded: z.date(),
    image: image(), // Validates and imports the image as an asset
    alt: z.string(),
    sold: z.boolean(),
    price: z.number().positive(),
    // Physical measurements in inches — optional until Barbara measures each
    // piece. Powers the "24 × 36 in" labels, grid scale cues, and AR true-size.
    widthIn: z.number().positive().optional(),
    heightIn: z.number().positive().optional(),
    depthIn: z.number().positive().optional(),
    // Studio drafts: saved but not yet published. Hidden from the gallery,
    // painting pages, and search engines until the draft flag comes off.
    draft: z.boolean().optional(),
    medium: z.string().optional(),
    // "View on your wall" AR models, built once in /admin and committed to
    // public/models. Absent = no AR section on the page.
    modelGlb: z.string().optional(),
    modelUsdz: z.string().optional(),
  }),
});

export const collections = { paintings };
