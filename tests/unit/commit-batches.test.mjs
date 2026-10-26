import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  commitBatches,
  MAX_BINARIES,
  MAX_FILES,
} from "../../src/lib/commit-batches.ts";

/** Big studio saves split into commits the server accepts. */

const md = (n) => Array.from({ length: n }, (_, i) => ({ path: `p/${i}.md` }));
const jpg = (n) =>
  Array.from({ length: n }, (_, i) => ({ path: `p/${i}.jpg` }));

describe("commitBatches", () => {
  it("keeps a painting's own save in one commit", () => {
    const files = [{ path: "a.md" }, { path: "a.jpg" }, { path: "a.glb" }];
    assert.deepEqual(commitBatches(files), [{ files, deletes: [] }]);
  });

  it("splits a big reorder by file count", () => {
    const batches = commitBatches(md(MAX_FILES * 2 + 5));
    assert.deepEqual(
      batches.map((b) => b.files.length),
      [MAX_FILES, MAX_FILES, 5],
    );
  });

  it("caps photos and models per commit", () => {
    const batches = commitBatches(jpg(MAX_BINARIES + 1));
    assert.deepEqual(
      batches.map((b) => b.files.length),
      [MAX_BINARIES, 1],
    );
  });

  it("splits a big trash emptying", () => {
    const paths = md(MAX_FILES + 1).map((f) => f.path);
    const batches = commitBatches([], paths);
    assert.deepEqual(
      batches.map((b) => b.deletes.length),
      [MAX_FILES, 1],
    );
  });

  it("sends nothing for nothing", () => {
    assert.deepEqual(commitBatches([]), []);
  });
});
