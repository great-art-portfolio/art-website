/**
 * `pnpm studio:reset`: reverts what the studio dev loop wrote. Tracked
 * gallery files are restored to HEAD, and untracked studio outputs (new
 * photos, models, drafts) are deleted. Only gallery paths are touched.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { rm, stat } from "node:fs/promises";

const execGit = promisify(execFile);

const TRACKED_SCOPE = [
  "src/content/announcement.txt",
  "src/content/paintings",
  "public/models",
];
const UNTRACKED_SCOPE = ["src/content/paintings", "public/models"];

async function main() {
  const { stdout } = await execGit("git", [
    "status",
    "--porcelain",
    "--",
    ...TRACKED_SCOPE,
  ]);
  let restored = 0;
  let deleted = 0;
  const restore = [];
  for (const line of stdout.split("\n")) {
    if (line.length < 4) continue;
    const flag = line.slice(0, 2);
    const file = line
      .slice(3)
      .trim()
      .replace(/^"(.*)"$/, "$1");
    if (flag === "??") {
      if (
        UNTRACKED_SCOPE.some(
          (dir) => file === dir || file.startsWith(`${dir}/`),
        )
      ) {
        try {
          if ((await stat(file)).isFile()) {
            await rm(file);
            deleted += 1;
          }
        } catch {
          // Already gone.
        }
      }
    } else if (
      flag[1] === "M" ||
      flag[1] === "D" ||
      flag[0] === "M" ||
      flag[0] === "D"
    ) {
      // Modified or deleted, in the worktree or staged. Checking out HEAD
      // restores it either way.
      restore.push(file);
    }
  }
  if (restore.length > 0) {
    await execGit("git", ["checkout", "--", ...restore]);
    restored = restore.length;
  }
  console.log(
    `Studio reset: ${restored} file${restored === 1 ? "" : "s"} restored, ${deleted} new file${deleted === 1 ? "" : "s"} deleted.`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
