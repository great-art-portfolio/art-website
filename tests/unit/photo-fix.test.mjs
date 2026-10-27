import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FLAT,
  WHOLE,
  findCorners,
  isConvex,
  isNoop,
  outputSize,
  rotateQuad,
  squareToQuad,
  toneTables,
  warp,
} from "../../src/lib/photo-fix.ts";

/** A w × h picture: wall colour everywhere, painting colour inside quad
 * (given in pixels), with a little noise on both like a phone photo. */
function photo(w, h, quadPx, wall = [200, 196, 188], paint = [40, 70, 120]) {
  const data = new Uint8ClampedArray(w * h * 4);
  const inside = (x, y) => {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = quadPx[i];
      const b = quadPx[(i + 1) % 4];
      const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
      const s = Math.sign(cross);
      if (s === 0) continue;
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
    return true;
  };
  let seed = 7;
  const noise = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return (seed % 9) - 4;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = inside(x, y) ? paint : wall;
      const i = (y * w + x) * 4;
      data[i] = c[0] + noise();
      data[i + 1] = c[1] + noise();
      data[i + 2] = c[2] + noise();
      data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

const near = (a, b, tol) => Math.abs(a - b) <= tol;

describe("findCorners", () => {
  it("finds a tilted painting on a plain wall", () => {
    const w = 240;
    const h = 200;
    const corners = [
      { x: 40, y: 30 },
      { x: 200, y: 42 },
      { x: 190, y: 170 },
      { x: 50, y: 160 },
    ];
    const quad = findCorners(photo(w, h, corners));
    assert.ok(quad !== null);
    for (let i = 0; i < 4; i++) {
      assert.ok(near(quad[i].x * (w - 1), corners[i].x, 3), `corner ${i} x`);
      assert.ok(near(quad[i].y * (h - 1), corners[i].y, 3), `corner ${i} y`);
    }
  });

  it("gives up when the painting fills the photo", () => {
    const w = 120;
    const h = 100;
    const all = [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ];
    assert.equal(findCorners(photo(w, h, all)), null);
  });

  it("gives up when there is nothing but wall", () => {
    const tiny = [
      { x: 10, y: 10 },
      { x: 11, y: 10 },
      { x: 11, y: 11 },
      { x: 10, y: 11 },
    ];
    assert.equal(findCorners(photo(120, 100, tiny)), null);
  });
});

describe("squareToQuad", () => {
  it("sends the square's corners to the quad's corners", () => {
    const q = [
      { x: 10, y: 5 },
      { x: 90, y: 12 },
      { x: 80, y: 70 },
      { x: 4, y: 60 },
    ];
    const map = squareToQuad(q);
    const unit = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    unit.forEach(([u, v], i) => {
      const p = map(u, v);
      assert.ok(near(p.x, q[i].x, 1e-9) && near(p.y, q[i].y, 1e-9));
    });
  });
});

describe("warp", () => {
  it("cuts the painting out of the wall", () => {
    const w = 200;
    const h = 160;
    const corners = [
      { x: 30, y: 20 },
      { x: 170, y: 30 },
      { x: 165, y: 140 },
      { x: 35, y: 130 },
    ];
    const src = photo(w, h, corners);
    const quad = corners.map((p) => ({ x: p.x / (w - 1), y: p.y / (h - 1) }));
    const out = warp(src, quad, 50, 40);
    // Sample well inside the edges: every pixel is painting, none wall.
    for (let y = 2; y < 38; y += 3) {
      for (let x = 2; x < 48; x += 3) {
        const i = (y * 50 + x) * 4;
        assert.ok(out[i] < 80 && out[i + 2] > 90, `pixel ${x},${y}`);
      }
    }
  });

  it("leaves the photo alone for the whole frame and a flat tone", () => {
    const src = photo(
      20,
      10,
      WHOLE.map((p) => ({ x: p.x * 20, y: p.y * 10 })),
    );
    const out = warp(src, WHOLE, 20, 10, FLAT);
    for (let i = 0; i < out.length; i += 4) {
      assert.equal(out[i], src.data[i]);
      assert.equal(out[i + 2], src.data[i + 2]);
    }
  });
});

describe("tone", () => {
  it("is the identity when flat", () => {
    const [r, g, b] = toneTables(FLAT);
    for (let i = 0; i < 256; i++) {
      assert.equal(r[i], i);
      assert.equal(g[i], i);
      assert.equal(b[i], i);
    }
  });

  it("brightens, warms, and adds contrast in the right direction", () => {
    const [br] = toneTables({ brightness: 0.5, warmth: 0, contrast: 0 });
    assert.ok(br[100] > 100);
    const [wr, , wb] = toneTables({ brightness: 0, warmth: 1, contrast: 0 });
    assert.ok(wr[128] > 128 && wb[128] < 128);
    const [cr] = toneTables({ brightness: 0, warmth: 0, contrast: 1 });
    assert.ok(cr[60] < 60 && cr[200] > 200);
  });
});

describe("rotateQuad", () => {
  const q = [
    { x: 0.1, y: 0.2 },
    { x: 0.8, y: 0.1 },
    { x: 0.9, y: 0.9 },
    { x: 0.2, y: 0.8 },
  ];

  it("keeps the whole frame whole", () => {
    for (const deg of [90, 180, 270])
      assert.deepEqual(rotateQuad(WHOLE, deg), WHOLE);
  });

  it("comes back after four quarter turns and stays convex", () => {
    let r = q;
    for (let i = 0; i < 4; i++) {
      r = rotateQuad(r, 90);
      assert.ok(isConvex(r));
    }
    r.forEach((p, i) =>
      assert.ok(near(p.x, q[i].x, 1e-12) && near(p.y, q[i].y, 1e-12)),
    );
  });
});

describe("outputSize", () => {
  const q = [
    { x: 0.1, y: 0.1 },
    { x: 0.9, y: 0.1 },
    { x: 0.9, y: 0.6 },
    { x: 0.1, y: 0.6 },
  ];

  it("follows the quad's shape without measurements", () => {
    const s = outputSize(q, 1000, 1000, 2000);
    assert.deepEqual(s, { width: 800, height: 500 });
  });

  it("follows her measured size when she has one", () => {
    const s = outputSize(q, 1000, 1000, 2000, { widthIn: 24, heightIn: 24 });
    assert.deepEqual(s, { width: 800, height: 800 });
  });

  it("never exceeds the upload limit", () => {
    const s = outputSize(WHOLE, 4000, 3000, 2000);
    assert.deepEqual(s, { width: 2000, height: 1500 });
  });
});

describe("isConvex and isNoop", () => {
  it("rejects a bow-tie", () => {
    assert.equal(
      isConvex([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ]),
      false,
    );
  });

  it("treats no fix, or the whole frame with a flat tone, as nothing", () => {
    assert.equal(isNoop(null), true);
    assert.equal(isNoop({ quad: WHOLE, tone: FLAT }), true);
    assert.equal(
      isNoop({ quad: WHOLE, tone: { ...FLAT, warmth: 0.2 } }),
      false,
    );
  });
});
