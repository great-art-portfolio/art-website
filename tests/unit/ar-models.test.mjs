import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const IN_TO_M = 0.0254;

function frontmatter(path) {
  const raw = readFileSync(path, "utf8");
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const data = {};
  for (const line of (m?.[1] ?? "").split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0)
      data[line.slice(0, i).trim()] = line
        .slice(i + 1)
        .trim()
        .replace(/^"|"$/g, "");
  }
  return data;
}

/** Overall min/max of the 24-vertex frame box inside a .glb. */
function boxExtents(glb) {
  assert.equal(glb.subarray(0, 4).toString(), "glTF", "GLB magic");
  const jsonLen = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLen).toString("utf8"));
  const box = json.accessors.find(
    (a) => a.count === 24 && Array.isArray(a.min),
  );
  assert.ok(box, "frame-box position accessor (24 verts)");
  return { min: box.min, max: box.max };
}

describe("AR models match the tape measurements", () => {
  const dir = join(root, "src", "content", "paintings");
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  assert.ok(files.length > 0, "paintings exist");

  for (const f of files) {
    const fm = frontmatter(join(dir, f));
    const stem = f.replace(/\.md$/, "");
    it(`${fm.title || stem}: GLB frame is true size`, () => {
      assert.ok(fm.modelGlb, "frontmatter points at a model");
      const glbPath = join(root, "public", fm.modelGlb.replace(/^\//, ""));
      assert.ok(existsSync(glbPath), `${fm.modelGlb} exists in public/`);
      const glb = readFileSync(glbPath);
      assert.ok(glb.length > 10_000, "model is not a stub");
      // 1024px JPEG textures keep each model a few hundred KB — flag
      // regressions before buyers pay the download.
      assert.ok(
        glb.length < 512 * 1024,
        `model is bloated: ${glb.length} bytes`,
      );
      const { min, max } = boxExtents(glb);
      const want = [
        Number(fm.widthIn) * IN_TO_M,
        Number(fm.heightIn) * IN_TO_M,
        Number(fm.depthIn) * IN_TO_M,
      ];
      const got = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
      for (let i = 0; i < 3; i += 1) {
        const err = Math.abs(got[i] - want[i]);
        assert.ok(
          err < 0.002,
          `axis ${i}: got ${got[i].toFixed(4)}m, want ${want[i].toFixed(4)}m`,
        );
      }
    });

    it(`${fm.title || stem}: USDZ exists and is a zip`, () => {
      if (fm.modelUsdz === undefined || fm.modelUsdz === "") return;
      const path = join(root, "public", fm.modelUsdz.replace(/^\//, ""));
      const usdz = readFileSync(path);
      assert.equal(usdz.subarray(0, 2).toString(), "PK", "USDZ zip magic");
      assert.ok(usdz.length > 10_000, "USDZ is not a stub");
    });
  }
});
