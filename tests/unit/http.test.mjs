import { afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { requireAdmin } from "../../functions/_lib/http.ts";
import { accessEmail, resetAccessCache } from "../../functions/_lib/access.ts";

const req = (url, token, cookie) =>
  new Request(url, {
    headers: {
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      ...(cookie === undefined ? {} : { cookie }),
    },
  });

describe("requireAdmin", () => {
  it("lets localhost in when no token is set, for dev and tests", async () => {
    assert.equal(
      await requireAdmin(req("http://127.0.0.1:4331/api/commit"), {}),
      null,
    );
    assert.equal(
      await requireAdmin(req("http://localhost:4332/api/commit"), {}),
      null,
    );
  });
  it("keeps the live site shut when the token is missing", async () => {
    const res = await requireAdmin(req("https://barbart.ca/api/commit"), {});
    assert.equal(res?.status, 401);
  });
  it("checks the token when one is set", async () => {
    const env = { ADMIN_API_TOKEN: "s3cret" };
    assert.equal(
      await requireAdmin(req("https://barbart.ca/api/commit", "s3cret"), env),
      null,
    );
    assert.equal(
      (await requireAdmin(req("https://barbart.ca/api/commit", "nope"), env))
        ?.status,
      401,
    );
    assert.equal(
      (await requireAdmin(req("http://127.0.0.1/api/commit"), env))?.status,
      401,
    );
  });
});

/** Cloudflare Access sign-in, with a test RSA key standing in for the
 * team's signing keys and fetch stubbed to serve them. */
describe("Access sign-in", () => {
  const TEAM = "team.cloudflareaccess.com";
  const AUD = "app-aud";
  const env = {
    ADMIN_API_TOKEN: "s3cret",
    ACCESS_TEAM_DOMAIN: TEAM,
    ACCESS_AUD: AUD,
  };
  const realFetch = globalThis.fetch;
  let keys;
  let other;
  let certsCalls = 0;

  const b64url = (bytes) =>
    Buffer.from(bytes)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  const genKey = () =>
    crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
  async function sign(pair, payload, kid = "k1", alg = "RS256") {
    const head = b64url(Buffer.from(JSON.stringify({ alg, kid, typ: "JWT" })));
    const body = b64url(Buffer.from(JSON.stringify(payload)));
    const sig = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      pair.privateKey,
      new TextEncoder().encode(`${head}.${body}`),
    );
    return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
  }
  const good = () => ({
    aud: [AUD],
    iss: `https://${TEAM}`,
    email: "barbara@example.ca",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const live = (cookie) =>
    req("https://barbart.ca/api/commit", undefined, cookie);

  before(async () => {
    keys = await genKey();
    other = await genKey();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    resetAccessCache();
  });
  const serveCerts = async () => {
    const jwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
    globalThis.fetch = async (url) => {
      assert.equal(String(url), `https://${TEAM}/cdn-cgi/access/certs`);
      certsCalls += 1;
      return Response.json({ keys: [{ ...jwk, kid: "k1" }] });
    };
  };

  it("lets her signed-in browser use the API without a token", async () => {
    await serveCerts();
    const token = await sign(keys, good());
    assert.equal(
      await requireAdmin(live(`a=1; CF_Authorization=${token}`), env),
      null,
    );
    assert.equal(
      await accessEmail(live(`CF_Authorization=${token}`), env),
      "barbara@example.ca",
    );
    // The header Access adds on protected paths works too.
    const viaHeader = new Request("https://barbart.ca/api/commit", {
      headers: { "cf-access-jwt-assertion": token },
    });
    assert.equal(await requireAdmin(viaHeader, env), null);
  });

  it("refuses a change another site's page starts with her cookie", async () => {
    await serveCerts();
    const token = await sign(keys, good());
    const post = (headers) =>
      new Request("https://barbart.ca/api/notify", {
        method: "POST",
        headers: { cookie: `CF_Authorization=${token}`, ...headers },
        body: "{}",
      });
    const evil = await requireAdmin(
      post({ "sec-fetch-site": "cross-site", origin: "https://evil.example" }),
      env,
    );
    assert.equal(evil?.status, 403);
    const oldBrowser = await requireAdmin(
      post({ origin: "https://evil.example" }),
      env,
    );
    assert.equal(oldBrowser?.status, 403);
    // The studio's own pages pass.
    assert.equal(
      await requireAdmin(
        post({ "sec-fetch-site": "same-origin", origin: "https://barbart.ca" }),
        env,
      ),
      null,
    );
    assert.equal(
      await requireAdmin(post({ origin: "https://barbart.ca" }), env),
      null,
    );
    // Reads stay open: another site can't see the answer anyway.
    assert.equal(
      await requireAdmin(
        new Request("https://barbart.ca/api/collectors?list=1", {
          headers: {
            cookie: `CF_Authorization=${token}`,
            "sec-fetch-site": "cross-site",
          },
        }),
        env,
      ),
      null,
    );
  });

  it("lets the token through from anywhere: it isn't sent by itself", async () => {
    const res = await requireAdmin(
      new Request("https://barbart.ca/api/notify", {
        method: "POST",
        headers: {
          authorization: "Bearer s3cret",
          "sec-fetch-site": "cross-site",
        },
      }),
      env,
    );
    assert.equal(res, null);
  });

  it("fetches the signing keys once, not per request", async () => {
    await serveCerts();
    certsCalls = 0;
    const token = await sign(keys, good());
    await requireAdmin(live(`CF_Authorization=${token}`), env);
    await requireAdmin(live(`CF_Authorization=${token}`), env);
    assert.equal(certsCalls, 1);
  });

  it("refuses forged, foreign, stale, and unsigned tokens", async () => {
    await serveCerts();
    const cases = [
      await sign(other, good()), // someone else's key
      await sign(keys, { ...good(), aud: ["another-app"] }),
      await sign(keys, { ...good(), iss: "https://evil.cloudflareaccess.com" }),
      await sign(keys, { ...good(), exp: Math.floor(Date.now() / 1000) - 10 }),
      await sign(keys, good(), "unknown-kid"),
      (await sign(keys, good())).replace(/\.[^.]+$/, ".AAAA"),
      "not-a-jwt",
    ];
    for (const token of cases) {
      const res = await requireAdmin(live(`CF_Authorization=${token}`), env);
      assert.equal(res?.status, 401, token.slice(0, 40));
    }
    // alg "none" with no signature.
    const head = b64url(Buffer.from('{"alg":"none","kid":"k1"}'));
    const body = b64url(Buffer.from(JSON.stringify(good())));
    assert.equal(
      (await requireAdmin(live(`CF_Authorization=${head}.${body}.`), env))
        ?.status,
      401,
    );
  });

  it("ignores the cookie when Access isn't configured", async () => {
    await serveCerts();
    const token = await sign(keys, good());
    const res = await requireAdmin(live(`CF_Authorization=${token}`), {
      ADMIN_API_TOKEN: "s3cret",
    });
    assert.equal(res?.status, 401);
  });

  it("stays shut when the key endpoint is down", async () => {
    globalThis.fetch = async () => new Response("down", { status: 503 });
    const token = await sign(keys, good());
    assert.equal(
      (await requireAdmin(live(`CF_Authorization=${token}`), env))?.status,
      401,
    );
  });
});
