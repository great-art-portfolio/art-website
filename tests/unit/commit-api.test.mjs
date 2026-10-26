import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../../functions/api/commit.ts";

/** Saves reach GitHub as real files: text inline in the tree, photos and
 * models as base64 blobs passed through untouched. */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const env = { GITHUB_TOKEN: "k", GITHUB_REPO: "o/r" };
const b64 = (s) => Buffer.from(s).toString("base64");

function stubGitHub() {
  const calls = { blobs: [], trees: [] };
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const body = init.body ? JSON.parse(init.body) : null;
    if (u.includes("/git/ref/heads/"))
      return Response.json({ object: { sha: "base" } });
    if (u.endsWith("/git/commits/base"))
      return Response.json({ tree: { sha: "t0" } });
    if (u.endsWith("/git/blobs")) {
      calls.blobs.push(body);
      return Response.json({ sha: `b${calls.blobs.length}` });
    }
    if (u.endsWith("/git/trees")) {
      calls.trees.push(body);
      return Response.json({ sha: "t1" });
    }
    if (u.endsWith("/git/commits")) return Response.json({ sha: "c1" });
    if (u.includes("/git/refs/heads/")) return Response.json({});
    throw new Error(`unexpected fetch ${u}`);
  };
  return calls;
}

const post = (body) =>
  onRequestPost({
    request: new Request("http://127.0.0.1:4331/api/commit", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    env,
  });

describe("POST /api/commit", () => {
  it("writes text inline and uploads photos as blobs", async () => {
    const calls = stubGitHub();
    const photo = b64("\xff\xd8\xff binary");
    const res = await post({
      message: "Add painting: Café",
      files: [
        {
          path: "src/content/paintings/cafe.md",
          contentBase64: b64('title: "Café 🌸"\n'),
        },
        { path: "src/content/paintings/cafe.jpg", contentBase64: photo },
      ],
    });
    assert.equal(res.status, 201);
    const [md, jpg] = calls.trees[0].tree;
    assert.equal(md.content, 'title: "Café 🌸"\n');
    assert.equal(md.sha, undefined);
    assert.deepEqual(calls.blobs, [{ content: photo, encoding: "base64" }]);
    assert.equal(jpg.sha, "b1");
  });

  it("accepts a big reorder of text files", async () => {
    stubGitHub();
    const files = Array.from({ length: 40 }, (_, i) => ({
      path: `src/content/paintings/p${i}.md`,
      contentBase64: b64(`order: ${i}\n`),
    }));
    assert.equal(
      (await post({ message: "Reorder gallery", files })).status,
      201,
    );
  });

  it("caps photos and models per commit", async () => {
    stubGitHub();
    const files = Array.from({ length: 13 }, (_, i) => ({
      path: `src/content/paintings/p${i}.jpg`,
      contentBase64: b64("x"),
    }));
    assert.equal((await post({ message: "Too many", files })).status, 400);
  });

  it("refuses content that isn't base64", async () => {
    stubGitHub();
    const res = await post({
      message: "Bad",
      files: [{ path: "src/content/paintings/a.jpg", contentBase64: "%%%" }],
    });
    assert.equal(res.status, 400);
  });
});
