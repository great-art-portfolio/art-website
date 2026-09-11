import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AUTOSAVE_MAX_AGE_MS, readBackup } from "../../src/lib/autosave.ts";

/** Room autosave |-shape and staleness: fresh backups restore, anything
 * older than a day (or unstamped) lets the file win. */

const NOW = 1_700_000_000_000;

function backup(overrides = {}) {
  return JSON.stringify({
    title: "Prairie Moon",
    price: "120",
    medium: "",
    alt: "",
    desc: "",
    w: "16",
    h: "16",
    d: "1.5",
    sold: true,
    publishOn: "",
    savedAt: NOW,
    ...overrides,
  });
}

describe("readBackup", () => {
  it("restores a fresh backup", () => {
    const got = readBackup(backup(), NOW);
    assert.equal(got?.title, "Prairie Moon");
    assert.equal(got?.sold, true);
    assert.equal(got?.savedAt, NOW);
  });

  it("drops backups older than a day", () => {
    assert.equal(
      readBackup(backup({ savedAt: NOW - AUTOSAVE_MAX_AGE_MS - 1 }), NOW),
      null,
    );
  });

  it("drops unstamped backups — too old to trust against the file", () => {
    const raw = JSON.stringify({ title: "X", sold: false });
    assert.equal(readBackup(raw, NOW), null);
  });

  it("drops garbled entries", () => {
    assert.equal(readBackup(null, NOW), null);
    assert.equal(readBackup("nope{", NOW), null);
    assert.equal(readBackup("[1,2]", NOW), null);
  });

  it("defaults wrong-typed fields instead of failing", () => {
    const got = readBackup(backup({ title: 7, sold: "yes" }), NOW);
    assert.equal(got?.title, "");
    assert.equal(got?.sold, false);
  });
});
