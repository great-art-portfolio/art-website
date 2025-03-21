import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

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
    price: z.number().positive()
  }),
});

// https://github.com/settings/applications/2929504
export const GITHUB_OAUTH_CLIENT_ID = "Ov23liJJKymVyVYsF8RX"

export const collections = { paintings };