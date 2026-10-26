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
    assert.equal(subject, 'New message about "First Thaw"');
    assert.match(
      text,
      /Jo \(jo@example\.com\) sent a message about "First Thaw"\./,
    );
    assert.match(text, /Price: \$125 CAD/);
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

describe("emails in the visitor's language", () => {
  it("tells her which language a buyer read the site in", () => {
    const { text } = inquiryEmail({
      paintingTitle: "Prairie Moon",
      priceCents: 65000,
      buyerName: "Camille",
      buyerEmail: "camille@resend.dev",
      message: "Bonjour",
      locale: "fr",
    });
    assert.match(text, /They read your site in French\./);
    const en = inquiryEmail({
      paintingTitle: "Prairie Moon",
      priceCents: 65000,
      buyerName: "Ada",
      buyerEmail: "ada@resend.dev",
      message: "Hi",
    });
    assert.doesNotMatch(en.text, /read your site in/);
  });

  it("confirms, greets and says goodbye in every language", async () => {
    const { confirmEmail, alreadyEmail, goodbyeEmail } =
      await import("../../functions/_lib/notify.ts");
    for (const code of ["fr", "ja", "pa"]) {
      const c = confirmEmail("https://barbart.ca/x?token=1", code);
      assert.match(c.text, /https:\/\/barbart\.ca\/x\?token=1/);
      assert.notEqual(c.subject, "Confirm your studio alerts");
      assert.notEqual(alreadyEmail(code).subject, alreadyEmail().subject);
      assert.match(goodbyeEmail(code).text, /— Barbara$/);
    }
  });
});
