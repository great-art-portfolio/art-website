import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { onRequestGet, onRequestPost } from "../../functions/api/notify.ts";

/** The studio's email to her list: the standard publish alert, or the
 * Email page's own subject and body. */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const env = { ADMIN_API_TOKEN: "admin" };
const call = (body) =>
  onRequestPost({
    request: new Request("https://barbart.ca/api/notify", {
      method: "POST",
      headers: { authorization: "Bearer admin" },
      body: JSON.stringify(body),
    }),
    env,
  });

describe("POST /api/notify", () => {
  it("answers with what the email reached, and nothing about browsers", async () => {
    // No mail configured: it reports an unsent email instead of failing.
    const res = await call({ email: true });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { emailed: false, emailTotal: 0 });
  });

  it("sends nothing when the email is switched off", async () => {
    globalThis.fetch = async () => {
      throw new Error("no call expected");
    };
    const res = await call({ email: false });
    assert.deepEqual(await res.json(), { emailed: false, emailTotal: 0 });
  });

  it("needs the studio's sign-in", async () => {
    const res = await onRequestPost({
      request: new Request("https://barbart.ca/api/notify", {
        method: "POST",
        body: "{}",
      }),
      env,
    });
    assert.equal(res.status, 401);
  });
});

describe("GET /api/notify", () => {
  it("previews the email from the draft words", async () => {
    const res = await onRequestGet({
      request: new Request(
        "https://barbart.ca/api/notify?subject=Open%20studio&body=Saturday",
        { headers: { authorization: "Bearer admin" } },
      ),
      env,
    });
    const data = await res.json();
    assert.equal(data.emailSubject, "Open studio");
    assert.match(data.emailText, /Saturday/);
    assert.equal("total" in data, false);
  });
});
