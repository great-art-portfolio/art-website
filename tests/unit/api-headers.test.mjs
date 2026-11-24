import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../../functions/api/_middleware.ts";

/** public/_headers doesn't reach Functions, so /api/* adds its own. */
describe("API responses", () => {
  it("carry the same protective headers as the pages, keeping their own", async () => {
    const res = await onRequest({
      request: new Request("https://barbart.ca/api/status"),
      next: async () =>
        new Response("{}", {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
    });
    assert.equal(res.status, 201);
    assert.equal(res.headers.get("content-type"), "application/json");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.match(
      res.headers.get("content-security-policy"),
      /frame-ancestors 'self'/,
    );
    assert.equal(res.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    assert.equal(
      res.headers.get("strict-transport-security"),
      "max-age=31536000",
    );

    const cached = await onRequest({
      request: new Request("http://127.0.0.1:4331/api/painting-image?slug=x"),
      next: async () =>
        new Response("img", {
          headers: { "cache-control": "public, max-age=3600" },
        }),
    });
    assert.equal(cached.headers.get("cache-control"), "public, max-age=3600");
    assert.equal(cached.headers.get("strict-transport-security"), null);
  });
});
