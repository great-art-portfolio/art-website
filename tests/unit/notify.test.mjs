import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { artistInbox } from "../../functions/_lib/notify.ts";

describe("artistInbox", () => {
  it("prefers the descriptive name", () => {
    assert.equal(
      artistInbox({
        ARTIST_INBOX: "studio@example.com",
        NOTIFY_EMAIL_TO: "legacy@example.com",
      }),
      "studio@example.com",
    );
  });

  it("falls back to the legacy name so mail never goes silent", () => {
    assert.equal(
      artistInbox({ NOTIFY_EMAIL_TO: "legacy@example.com" }),
      "legacy@example.com",
    );
  });

  it("is empty when neither is set", () => {
    assert.equal(artistInbox({}), "");
  });
});
