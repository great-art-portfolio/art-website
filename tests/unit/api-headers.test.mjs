import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../../functions/api/_middleware.ts";

/** public/_headers doesn't reach Functions, so /api/* adds its own. */
describe("API responses", () => {
  it("carry the same protective headers as the pages, keeping their own", async () => {
    const res = await onRequest({
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
  });
});
