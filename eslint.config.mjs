import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import astro from "eslint-plugin-astro";

/**
 * Recommended rule sets without type-aware rules, which are slow and noisy
 * on .astro files and duplicate tsc. Covers src, functions, scripts, and
 * tests, and skips vendored browser bundles.
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
    // Playwright scripts run in node but contain browser callbacks.
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
