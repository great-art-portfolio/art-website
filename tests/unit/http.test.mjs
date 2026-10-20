import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { requireAdmin } from "../../functions/_lib/http.ts";

const req = (url, token) =>
  new Request(url, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });

describe("requireAdmin", () => {
  it("lets localhost in when no token is set, for dev and tests", () => {
    assert.equal(
      requireAdmin(req("http://127.0.0.1:4331/api/commit"), {}),
      null,
    );
    assert.equal(
      requireAdmin(req("http://localhost:4332/api/commit"), {}),
      null,
    );
  });
  it("keeps the live site shut when the token is missing", () => {
    const res = requireAdmin(req("https://barbart.ca/api/commit"), {});
    assert.equal(res?.status, 401);
  });
  it("checks the token when one is set", () => {
    const env = { ADMIN_API_TOKEN: "s3cret" };
    assert.equal(
      requireAdmin(req("https://barbart.ca/api/commit", "s3cret"), env),
      null,
    );
    assert.equal(
      requireAdmin(req("https://barbart.ca/api/commit", "nope"), env)?.status,
      401,
    );
    assert.equal(
      requireAdmin(req("http://127.0.0.1/api/commit"), env)?.status,
      401,
    );
  });
});
