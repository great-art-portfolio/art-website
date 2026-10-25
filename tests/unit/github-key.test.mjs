import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { onRequestPut } from "../../functions/api/commit.ts";

/** The site's GitHub key: a refusal reads as plain words, and the listing
 * carries the key's last day so the studio can warn ahead. */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const list = () =>
  onRequestPut({
    request: new Request("http://127.0.0.1:4331/api/commit", { method: "PUT" }),
    env: { GITHUB_TOKEN: "k", GITHUB_REPO: "o/r" },
  });

describe("GitHub key", () => {
  it("passes the key's last day along with the listing", async () => {
    globalThis.fetch = async () =>
      Response.json([{ name: "thaw.md", type: "file" }], {
        headers: {
          "github-authentication-token-expiration": "2026-11-10 08:00:00 UTC",
        },
      });
    const res = await list();
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.keyExpires, "2026-11-10");
  });

  it("says the key ran out instead of blaming her connection", async () => {
    globalThis.fetch = async () =>
      new Response('{"message":"Bad credentials"}', { status: 401 });
    const res = await list();
    assert.equal(res.status, 503);
    const data = await res.json();
    assert.equal(data.code, "github-key");
    assert.match(data.error, /GitHub key has run out\. Ask Chris/);
  });

  it("treats a rate limit as a passing hiccup, not a dead key", async () => {
    globalThis.fetch = async () =>
      new Response('{"message":"API rate limit exceeded"}', { status: 403 });
    assert.equal((await list()).status, 500);
  });
});
