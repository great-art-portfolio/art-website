import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { onRequestPut } from "../../functions/api/commit.ts";
import { appJwt, resetAppTokenCache } from "../../functions/_lib/github-app.ts";

/** The site signs in to GitHub as an App, whose key never expires: it
 * mints an hour-long token per installation and reuses it. */

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const pem = privateKey.export({ type: "pkcs8", format: "pem" });

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  resetAppTokenCache();
});

const env = { GITHUB_APP_ID: "123", GITHUB_APP_KEY: pem, GITHUB_REPO: "o/r" };
const list = (e = env) =>
  onRequestPut({
    request: new Request("http://127.0.0.1:4331/api/commit", { method: "PUT" }),
    env: e,
  });

function stubGitHub({ installed = true } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({
      url: u,
      auth: new Headers(init.headers).get("authorization"),
    });
    if (u.endsWith("/repos/o/r/installation"))
      return installed
        ? Response.json({ id: 7 })
        : new Response('{"message":"Not Found"}', { status: 404 });
    if (u.endsWith("/app/installations/7/access_tokens"))
      return Response.json({
        token: "ghs_minted",
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      });
    if (u.includes("/contents/"))
      return Response.json([{ name: "thaw.md", type: "file" }], {
        headers: {
          "github-authentication-token-expiration": "2026-10-25 20:00:00 UTC",
        },
      });
    throw new Error(`unexpected fetch ${u}`);
  };
  return calls;
}

describe("GitHub App sign-in", () => {
  it("signs a JWT GitHub can verify, issued by the App", async () => {
    const jwt = await appJwt("123", pem, Date.parse("2026-10-25T12:00:00Z"));
    const [head, body, sig] = jwt.split(".");
    const ok = createVerify("RSA-SHA256")
      .update(`${head}.${body}`)
      .verify(publicKey, Buffer.from(sig, "base64url"));
    assert.ok(ok);
    const claims = JSON.parse(Buffer.from(body, "base64url").toString());
    assert.equal(claims.iss, "123");
    assert.ok(claims.exp - claims.iat <= 600);
  });

  it("lists with a minted token and reuses it", async () => {
    const calls = stubGitHub();
    assert.equal((await list()).status, 200);
    const res = await list();
    const data = await res.json();
    assert.deepEqual(data.files, ["thaw.md"]);
    const mints = calls.filter((c) => c.url.endsWith("/access_tokens"));
    assert.equal(mints.length, 1);
    const reads = calls.filter((c) => c.url.includes("/contents/"));
    assert.ok(reads.every((c) => c.auth === "Bearer ghs_minted"));
    // An App token's hour-long life is no reason to warn her.
    assert.equal(data.keyExpires, null);
  });

  it("prefers the App over an old personal key", async () => {
    const calls = stubGitHub();
    await list({ ...env, GITHUB_TOKEN: "old" });
    assert.ok(!calls.some((c) => c.auth === "Bearer old"));
  });

  it("reads an App removed from the repo as GitHub refusing", async () => {
    stubGitHub({ installed: false });
    const res = await list();
    assert.equal(res.status, 503);
    const data = await res.json();
    assert.equal(data.code, "github-key");
    assert.match(data.error, /Ask Chris/);
  });
});
