import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { commitFiles } from "../../functions/_lib/github.ts";

/** A studio save that races another commit (the dashboard's background
 * translations) lands on top of it instead of failing. */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const config = {
  token: () => Promise.resolve("t"),
  expiring: false,
  repo: "o/r",
  branch: "main",
};

/** GitHub whose branch moves once, under the first ref update. */
function racingGitHub() {
  let head = "a";
  let patches = 0;
  const parents = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const method = init.method ?? "GET";
    if (u.includes("/git/ref/heads/"))
      return Response.json({ object: { sha: head } });
    if (method === "GET" && u.includes("/git/commits/"))
      return Response.json({ tree: { sha: `tree-${head}` } });
    if (u.endsWith("/git/trees")) return Response.json({ sha: "newtree" });
    if (u.endsWith("/git/commits")) {
      parents.push(JSON.parse(init.body).parents[0]);
      return Response.json({ sha: `c${parents.length}` });
    }
    if (method === "PATCH") {
      patches += 1;
      if (patches === 1) {
        head = "b";
        return new Response("Update is not a fast forward", { status: 422 });
      }
      return Response.json({});
    }
    throw new Error(`unexpected ${method} ${u}`);
  };
  return { parents, patches: () => patches };
}

describe("commitFiles when another commit lands first", () => {
  it("rebases onto it for the studio", async () => {
    const gh = racingGitHub();
    const sha = await commitFiles(
      config,
      "Edit painting: X",
      [{ path: "src/content/paintings/x.md", text: "hi" }],
      { rebase: true },
    );
    assert.equal(sha, "c2");
    assert.deepEqual(gh.parents, ["a", "b"]);
  });

  it("refuses by default, so a second sale is caught", async () => {
    racingGitHub();
    await assert.rejects(
      commitFiles(config, "Sold online: X", [
        { path: "src/content/paintings/x.md", text: "sold" },
      ]),
      /422/,
    );
  });
});
