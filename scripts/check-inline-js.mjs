/**
 * Fails the build if a classic (non-module, non-JSON) inline <script> in
 * dist/ contains `import` statements or TypeScript syntax. Astro emits
 * component page scripts as classic scripts, so either one silently kills
 * the whole handler at runtime (button+form both visible, dead buttons).
 * Dynamic import() is fine and ignored by this check.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../dist/", import.meta.url).pathname;
const suspect =
  /^\s*import[\s"'{*]|declare\s+\w|:\s*(string|number|void|boolean|never|unknown|any|HTMLElement|HTML\w*)\b|\bas\s+(const|unknown|HTML\w*|[A-Z][\w<>|[\]]*)/m;

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...htmlFiles(p));
    else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

let failures = 0;
for (const file of htmlFiles(root)) {
  const html = readFileSync(file, "utf8");
  const tags = [
    ...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g),
  ];
  for (const m of tags) {
    if (/\btype\s*=\s*["']?(module|application\/ld\+json)/.test(m[1])) continue;
    const lines = m[2].split("\n").filter((l) => !l.trim().startsWith("//"));
    if (suspect.test(lines.join("\n"))) {
      console.error(`RAW TS/IMPORT in classic inline script: ${file}`);
      failures += 1;
    }
  }
}
if (failures > 0) {
  console.error(
    "\nMove it to an external .ts file (<script src>) or use dynamic import().",
  );
  process.exit(1);
}
console.log("inline scripts OK");
