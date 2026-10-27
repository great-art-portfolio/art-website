/**
 * Builds the site the browser tests run against from fixed paintings
 * (tests/fixtures/site, her collection as of 2026-10-27 morning), so her
 * real uploads, edits and trash never change what the tests see.
 *
 * The build inputs are copied to .e2e/ with the fixtures in place of
 * src/content and public/models, and built there into .e2e/dist. The
 * working tree is never touched. Playwright serves .e2e/dist.
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { resolve } from "node:path";

const OUT = ".e2e";
const FIXTURES = "tests/fixtures/site";

const under = (path, dir) => path === dir || path.startsWith(`${dir}/`);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
// functions/ comes along because a studio page imports from it.
for (const entry of [
  "src",
  "public",
  "functions",
  "astro.config.mjs",
  "tsconfig.json",
  "package.json",
]) {
  cpSync(entry, `${OUT}/${entry}`, {
    recursive: true,
    filter: (p) => !under(p, "src/content") && !under(p, "public/models"),
  });
}
cpSync(`${FIXTURES}/content`, `${OUT}/src/content`, { recursive: true });
cpSync(`${FIXTURES}/models`, `${OUT}/public/models`, { recursive: true });
symlinkSync(resolve("node_modules"), `${OUT}/node_modules`, "dir");

// Built from inside the copy: some pages read src/content relative to the
// working directory.
execFileSync("pnpm", ["exec", "astro", "build"], {
  cwd: OUT,
  stdio: "inherit",
});
