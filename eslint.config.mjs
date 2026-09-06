import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import astro from "eslint-plugin-astro";

/**
 * Lint, scoped for speed: plain recommended sets, no type-aware rules
 * (slow and noisy on .astro — tsc already covers types). Covers src,
 * functions, scripts, and tests; vendored browser bundles stay out.
 */
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      ".astro/**",
      "node_modules/**",
      "public/js/**",
      "test-results/**",
      ".wrangler/**",
      // Wrangler-generated Cloudflare types.
      "functions/types.d.ts",
    ],
  },
  {
    files: [
      "scripts/**/*",
      "functions/**/*",
      "tests/unit/**/*",
      "playwright.config.ts",
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["public/sw.js"],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    // Playwright driver scripts: node file, browser callbacks inside.
    files: ["tests/*.spec.ts", "scripts/ar-backfill/run.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs["flat/recommended"],
  {
    files: ["**/*.mjs", "**/*.cjs"],
    languageOptions: { sourceType: "module" },
  },
  {
    rules: {
      // AI's favorite droppings, caught at the gate instead of in review.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": "off",
    },
  },
);
