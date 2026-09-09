import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { artistInbox, artistSender } from "../../functions/_lib/notify.ts";

describe("artistInbox", () => {
  it("reads the inbox", () => {
    assert.equal(
      artistInbox({ ARTIST_INBOX: "studio@example.com" }),
      "studio@example.com",
    );
  });

  it("is empty when unset", () => {
    assert.equal(artistInbox({}), "");
  });
});

describe("artistSender", () => {
  it("reads the sender", () => {
    assert.equal(
      artistSender({ ARTIST_SENDER: "Gallery <studio@example.com>" }),
      "Gallery <studio@example.com>",
    );
  });

  it("defaults to the onboarding identity", () => {
    assert.equal(artistSender({}), "Gallery <onboarding@resend.dev>");
  });
});
