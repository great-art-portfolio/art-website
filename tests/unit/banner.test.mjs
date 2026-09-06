import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  daysLeft,
  expiryForDuration,
  formatAnnouncement,
  isExpired,
  localToday,
  parseAnnouncement,
} from "../../src/lib/banner.ts";

describe("parseAnnouncement", () => {
  it("reads text with no expiry line", () => {
    assert.deepEqual(parseAnnouncement("Hello"), { text: "Hello", expires: null });
  });

  it("reads the expires line plus multi-word text", () => {
    assert.deepEqual(parseAnnouncement("expires: 2026-09-19\nFind me Sunday!"), {
      text: "Find me Sunday!",
      expires: "2026-09-19",
    });
  });

  it("treats a malformed first line as banner text", () => {
    assert.deepEqual(parseAnnouncement("expires: soon\nHi"), {
      text: "expires: soon\nHi",
      expires: null,
    });
  });

  it("empty file is an empty banner", () => {
    assert.deepEqual(parseAnnouncement("  \n"), { text: "", expires: null });
  });
});

describe("formatAnnouncement", () => {
  it("round-trips through parse", () => {
    const body = formatAnnouncement("Lilac Festival!", "2026-09-19");
    assert.deepEqual(parseAnnouncement(body), {
      text: "Lilac Festival!",
      expires: "2026-09-19",
    });
  });

  it("empty text clears, even with an expiry", () => {
    assert.equal(formatAnnouncement("   ", "2026-09-19"), "");
  });

  it("no end date writes no expires line", () => {
    assert.equal(formatAnnouncement("Hi", null), "Hi");
  });
});

describe("expiry", () => {
  it("shows through the expiry date, hides after", () => {
    assert.equal(isExpired("2026-09-19", "2026-09-18"), false);
    assert.equal(isExpired("2026-09-19", "2026-09-19"), false);
    assert.equal(isExpired("2026-09-19", "2026-09-20"), true);
  });

  it("no end date never expires", () => {
    assert.equal(isExpired(null, "2030-01-01"), false);
  });

  it("durations land on the right date", () => {
    const now = new Date(2026, 8, 5, 12, 0, 0); // Sep 5, local noon
    assert.equal(expiryForDuration(1, now), "2026-09-06");
    assert.equal(expiryForDuration(7, now), "2026-09-12");
    assert.equal(expiryForDuration(14, now), "2026-09-19");
    assert.equal(expiryForDuration(null, now), null);
  });

  it("daysLeft counts whole days, negative when past", () => {
    assert.equal(daysLeft("2026-09-12", "2026-09-05"), 7);
    assert.equal(daysLeft("2026-09-05", "2026-09-05"), 0);
    assert.equal(daysLeft("2026-09-03", "2026-09-05"), -2);
  });

  it("localToday is a local (not UTC) date", () => {
    assert.match(localToday(new Date(2026, 0, 2, 3, 4, 5)), /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(localToday(new Date(2026, 0, 2, 3, 4, 5)), "2026-01-02");
  });

});
