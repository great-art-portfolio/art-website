import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { roomLayout, SOFA_WIDTH_IN } from "../../src/lib/room.ts";
import { ROOM } from "../../src/lib/room-data.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Back from percentages to render pixels. */
function artPx(l) {
  return {
    left: (l.art.left / 100) * ROOM.width,
    top: (l.art.top / 100) * ROOM.height,
    width: (l.art.width / 100) * ROOM.width,
    height: (l.art.height / 100) * ROOM.height,
  };
}

describe("roomLayout", () => {
  it("hangs a painting at true size, centred on the sofa", () => {
    const l = roomLayout(24, 24);
    const a = artPx(l);
    const inchPx = 0.0254 * ROOM.pxPerMeter;
    assert.ok(Math.abs(a.width - 24 * inchPx) < 0.1);
    assert.ok(Math.abs(a.height - 24 * inchPx) < 0.1);
    assert.ok(Math.abs(a.left + a.width / 2 - ROOM.wallOriginX) < 0.1);
  });
  it("keeps the bottom edge 9 in above the sofa back", () => {
    for (const [w, h] of [
      [12, 12],
      [36, 16],
      [30, 40],
    ]) {
      const a = artPx(roomLayout(w, h));
      const bottomM = (ROOM.wallOriginY - (a.top + a.height)) / ROOM.pxPerMeter;
      assert.ok(Math.abs(bottomM - (ROOM.sofaTopM + 9 * 0.0254)) < 0.001);
    }
  });
  it("crops inside the render, wider for a big painting", () => {
    const small = roomLayout(12, 12);
    const big = roomLayout(60, 40);
    for (const l of [small, big]) {
      // The crop's edges, in render percent, stay inside 0..100.
      const left = (-l.stage.left / l.stage.width) * 100;
      const top = (-l.stage.top / l.stage.height) * 100;
      assert.ok(left >= -0.01 && top >= -0.01);
      assert.ok(left + 10000 / l.stage.width <= 100.01);
      assert.ok(top + 10000 / l.stage.height <= 100.01);
    }
    assert.ok(big.stage.width < small.stage.width);
  });
  it("lines the light map up with the render", () => {
    const l = roomLayout(24, 24);
    // The light box spans the whole render, offset by the painting.
    assert.ok(Math.abs((l.light.width * l.art.width) / 100 - 100) < 0.01);
    assert.ok(
      Math.abs((-l.light.left * l.art.width) / 100 - l.art.left) < 0.01,
    );
  });
  it("crops to the photo's shape, inside the render", () => {
    for (const aspect of [0.75, 1, 1.25, 2.2]) {
      const l = roomLayout(24, 24, aspect);
      assert.equal(l.aspect, aspect);
      // The render in crop percent keeps the render's own shape.
      const renderAspect = (l.stage.width * aspect) / l.stage.height;
      assert.ok(Math.abs(renderAspect - ROOM.width / ROOM.height) < 0.01);
      const left = (-l.stage.left / l.stage.width) * 100;
      const top = (-l.stage.top / l.stage.height) * 100;
      assert.ok(left >= -0.01 && top >= -0.01);
      assert.ok(left + 10000 / l.stage.width <= 100.01);
      assert.ok(top + 10000 / l.stage.height <= 100.01);
    }
  });
  it("skips paintings without a size", () => {
    assert.equal(roomLayout(0, 24), null);
    assert.equal(roomLayout(Number.NaN, 24), null);
  });
  it("has its assets and a sensible sofa", () => {
    for (const f of ["1000", "1600", "2000", "light"])
      assert.ok(
        existsSync(join(root, "public", "rooms", `living-room-${f}.webp`)),
      );
    assert.ok(SOFA_WIDTH_IN > 60 && SOFA_WIDTH_IN < 90);
  });
});
