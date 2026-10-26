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
      const { titles, alerts } = await publishDueFiles(dir, "2026-10-03");
      assert.deepEqual(titles, ["Due", "Overdue"]);
      assert.deepEqual(alerts, { email: false, slug: "" });
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
      assert.deepEqual((await publishDueFiles(dir, "2026-10-03")).titles, []);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("scheduled alerts", () => {
  it("hands the ticked alerts to the send step, once, and drops them", async () => {
    const dir = await mkdtemp(join(tmpdir(), "publish-due-alerts-"));
    try {
      await writeFile(
        join(dir, "a.md"),
        md(
          "Night Reeds",
          'draft: true\npublishOn: "2026-10-03"\nalertOnPublish: "email"\n',
        ),
      );
      await writeFile(
        join(dir, "b.md"),
        md(
          "Thaw",
          'draft: true\npublishOn: "2026-10-02"\nalertOnPublish: "push"\n',
        ),
      );
      const { alerts } = await publishDueFiles(dir, "2026-10-03");
      // b.md's "push" (browser alerts, since removed) is ignored.
      assert.deepEqual(alerts, { email: true, slug: "night-reeds" });
      const text = await readFile(join(dir, "a.md"), "utf8");
      assert.doesNotMatch(text, /^alertOnPublish:/m);
      // Published already, so a rerun sends nothing.
      const again = await publishDueFiles(dir, "2026-10-03");
      assert.deepEqual(again.alerts, { email: false, slug: "" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
