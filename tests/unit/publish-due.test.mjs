import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { todayKey } from "../../src/lib/painting-edit.ts";
import { publishDueFiles } from "../../scripts/publish-due.mjs";

/** The nightly job publishes scheduled drafts nobody opened the studio
 * for, by the studio's calendar, not the server's. */

const md = (title, extra) =>
  `---\ntitle: "${title}"\nprice: 100.00\n${extra}---\n\nBody.\n`;

describe("studio calendar day", () => {
  it("is Calgary's date, not UTC's", () => {
    // 03:00 UTC on Oct 3 is still the evening of Oct 2 in Calgary (MDT).
    assert.equal(todayKey(new Date("2026-10-03T03:00:00Z")), "2026-10-02");
    // 07:10 UTC is just past Calgary midnight, summer or winter.
    assert.equal(todayKey(new Date("2026-10-03T07:10:00Z")), "2026-10-03");
    assert.equal(todayKey(new Date("2026-01-15T07:10:00Z")), "2026-01-15");
  });
});

describe("nightly publish", () => {
  it("publishes only due drafts, leaving the rest byte for byte", async () => {
    const dir = await mkdtemp(join(tmpdir(), "publish-due-"));
    try {
      const files = {
        "due.md": md("Due", 'draft: true\npublishOn: "2026-10-03"\n'),
        "overdue.md": md("Overdue", 'draft: true\npublishOn: "2026-09-01"\n'),
        "later.md": md("Later", 'draft: true\npublishOn: "2026-10-04"\n'),
        "unscheduled.md": md("Unscheduled", "draft: true\n"),
        "trashed.md": md(
          "Trashed",
          'draft: true\npublishOn: "2026-09-01"\ntrash: true\n',
        ),
        "live.md": md("Live", "draft: false\n"),
      };
      for (const [name, text] of Object.entries(files)) {
        await writeFile(join(dir, name), text);
      }
      const titles = await publishDueFiles(dir, "2026-10-03");
      assert.deepEqual(titles, ["Due", "Overdue"]);
      for (const name of ["due.md", "overdue.md"]) {
        const text = await readFile(join(dir, name), "utf8");
        assert.match(text, /^draft: false$/m);
        assert.doesNotMatch(text, /^publishOn:/m);
      }
      for (const name of [
        "later.md",
        "unscheduled.md",
        "trashed.md",
        "live.md",
      ]) {
        assert.equal(await readFile(join(dir, name), "utf8"), files[name]);
      }
      // A second run finds nothing left to do.
      assert.deepEqual(await publishDueFiles(dir, "2026-10-03"), []);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
