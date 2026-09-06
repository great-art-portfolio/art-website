/** Prettier: the formatter. Astro files go through prettier-plugin-astro;
 * everything else uses Prettier's defaults (2-space, double quotes). */
export default {
  plugins: ["prettier-plugin-astro"],
  overrides: [
    {
      files: "*.astro",
      options: { parser: "astro" },
    },
  ],
};
