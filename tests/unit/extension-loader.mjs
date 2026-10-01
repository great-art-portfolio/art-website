import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * ESM resolve hook for dev and tests. Resolves extensionless relative imports
 * (`../_lib/x` → `../_lib/x.ts`), which Astro, Vite and wrangler accept but
 * node does not. It only applies after node's resolution fails, to relative
 * specifiers with no extension, when the .ts file exists. Anything else
 * rethrows. This is not shipped; the studio sidecar uses it so `pnpm dev` can
 * run the real Functions handlers.
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
