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


// GITHUB_OAUTH_CLIENT_ID
// https://github.com/settings/apps/art-website-oauth
export const clientId = "Iv23liPOccG81ylXeot0";

// My backend worker
export const workerUrl = "https://art-website-cm4.pages.dev/admin-oauth";

export const repositoryUrl = "https://github.com/great-art-portfolio/art-website"

export const collections = { paintings };