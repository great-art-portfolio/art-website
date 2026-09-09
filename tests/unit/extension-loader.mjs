import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Test-only ESM hook: resolve the bundler-style extensionless relative
 * imports (`../_lib/x` → `../_lib/x.ts`) that Astro, Vite, and wrangler
 * understand but node cannot. Only fires after node's own resolution
 * fails, only for relative specifiers without an extension, and only
 * when the .ts file actually exists — everything else rethrows.
 * Production code stays extensionless; this never ships.
 */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    const relative = specifier.startsWith("./") || specifier.startsWith("../");
    const bare =
      !specifier.endsWith(".ts") &&
      !specifier.endsWith(".mjs") &&
      !specifier.endsWith(".js") &&
      !specifier.endsWith(".json");
    if (
      err?.code === "ERR_MODULE_NOT_FOUND" &&
      relative &&
      bare &&
      context.parentURL?.startsWith("file:")
    ) {
      const candidate = resolvePath(
        dirname(fileURLToPath(context.parentURL)),
        `${specifier}.ts`,
      );
      if (existsSync(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
    throw err;
  }
}
