/** Astro files go through prettier-plugin-astro. Everything else uses
 * Prettier's defaults. */
export default {
  plugins: ["prettier-plugin-astro"],
  overrides: [
    {
      files: "*.astro",
      options: { parser: "astro" },
    },
  ],
};
