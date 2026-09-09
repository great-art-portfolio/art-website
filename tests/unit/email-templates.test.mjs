import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  confirmEmail,
  goodbyeEmail,
  inquiryEmail,
} from "../../functions/_lib/notify.ts";

describe("inquiryEmail", () => {
  it("keeps the artist-facing wording", () => {
    const { subject, text } = inquiryEmail({
      paintingTitle: "First Thaw",
      priceCents: 12500,
      buyerName: "Jo",
      buyerEmail: "jo@example.com",
      message: "Is it still available?",
    });
    assert.equal(subject, 'New inquiry: "First Thaw"');
    assert.match(text, /Jo \(jo@example\.com\) wants "First Thaw"\./);
    assert.match(text, /Price: \$125\.00 CAD/);
    assert.match(text, /Is it still available\?/);
  });

  it("marks an empty message instead of leaving a hole", () => {
    const { text } = inquiryEmail({
      paintingTitle: "X",
      priceCents: 1,
      buyerName: "Jo",
      buyerEmail: "jo@example.com",
      message: "",
    });
    assert.match(text, /\(No message\)/);
  });
});

describe("confirmEmail", () => {
  it("links the confirmation tap", () => {
    const url = "https://barbart.ca/email/confirmed?token=abc123";
    const { subject, text } = confirmEmail(url);
    assert.match(subject, /Confirm/);
    assert.ok(text.includes(url));
    assert.match(text, /nothing joins the list/);
  });
});

describe("goodbyeEmail", () => {
  it("confirms the removal", () => {
    const { subject, text } = goodbyeEmail();
    assert.match(subject, /Removed/);
    assert.match(text, /no more emails/);
  });
});
