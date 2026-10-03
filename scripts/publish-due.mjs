/** Publishes scheduled drafts whose day has come, so a "Publish on" date
 * goes live even when nobody opens the studio. The nightly workflow
 * (.github/workflows/publish-scheduled.yml) runs this, then commits what it
 * changed; Pages rebuilds on that push. Same rules as the studio's own
 * check on load: re-reads each file, skips trashed paintings, and uses the
 * studio's calendar day. Run by hand with `node scripts/publish-due.mjs`.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  isPublishDue,
  parsePainting,
  publishDue,
  todayKey,
} from "../src/lib/painting-edit.ts";

export const PAINTINGS_DIR = "src/content/paintings";

/** The published text of a painting file, or null when it isn't due. */
export function dueContent(md, today) {
  const parsed = parsePainting(md);
  if (parsed === null || !parsed.draft || parsed.trash) return null;
  if (!isPublishDue(parsed.publishOn, today)) return null;
  return { title: parsed.title, content: publishDue(md) };
}

/** Publishes every due painting in `dir`. Returns the titles published. */
export async function publishDueFiles(dir, today) {
  const titles = [];
  for (const name of (await readdir(dir)).sort()) {
    if (!name.endsWith(".md")) continue;
    const path = join(dir, name);
    const due = dueContent(await readFile(path, "utf8"), today);
    if (due === null) continue;
    await writeFile(path, due.content);
    titles.push(due.title);
  }
  return titles;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const today = todayKey();
  const titles = await publishDueFiles(PAINTINGS_DIR, today);
  console.log(
    titles.length === 0
      ? `Nothing scheduled for ${today} or earlier.`
      : `Published: ${titles.map((t) => `"${t}"`).join(", ")}`,
  );
}
