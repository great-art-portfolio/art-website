import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildMetrics, sourceName } from "../../functions/_lib/metrics.ts";
import {
  bars,
  countryName,
  dayLabel,
  trendSentence,
  visitsLabel,
} from "../../src/lib/metrics-view.ts";

/** The studio's Metrics page in plain words: visits by day, paintings,
 * sources, places, devices. */

const window = {
  from: new Date("2026-10-01T12:00:00Z"),
  to: new Date("2026-10-04T12:00:00Z"),
};
const rows = {
  days: [
    { count: 30, dimensions: { date: "2026-10-02" }, sum: { visits: 20 } },
    { count: 10, dimensions: { date: "2026-10-04" }, sum: { visits: 10 } },
  ],
  before: [{ count: 50, sum: { visits: 10 } }],
  pages: [
    { count: 20, dimensions: { requestPath: "/paintings/night-reeds" } },
    { count: 10, dimensions: { requestPath: "/paintings/night-reeds/" } },
    { count: 10, dimensions: { requestPath: "/paintings/indigo-tide" } },
  ],
  sources: [
    { dimensions: { refererHost: "" }, sum: { visits: 20 } },
    { dimensions: { refererHost: "www.google.com" }, sum: { visits: 10 } },
    { dimensions: { refererHost: "l.instagram.com" }, sum: { visits: 10 } },
    { dimensions: { refererHost: "barbart.ca" }, sum: { visits: 40 } },
    { dimensions: { refererHost: "127.0.0.1" }, sum: { visits: 10 } },
  ],
  places: [
    { dimensions: { countryName: "CA" }, sum: { visits: 20 } },
    { dimensions: { countryName: "" }, sum: { visits: 10 } },
  ],
  devices: [
    { dimensions: { deviceType: "desktop" }, sum: { visits: 20 } },
    { dimensions: { deviceType: "mobile" }, sum: { visits: 10 } },
  ],
};

describe("buildMetrics", () => {
  const m = buildMetrics(rows, window, "barbart.ca");

  it("has every day of the window, quiet days as zero", () => {
    assert.deepEqual(
      m.days.map((d) => [d.date, d.visits]),
      [
        ["2026-10-01", 0],
        ["2026-10-02", 20],
        ["2026-10-03", 0],
        ["2026-10-04", 10],
      ],
    );
    assert.equal(m.visits, 30);
    assert.equal(m.visitsBefore, 10);
  });

  it("counts a painting once, with or without a trailing slash", () => {
    assert.deepEqual(m.paintings, [
      { slug: "night-reeds", views: 30 },
      { slug: "indigo-tide", views: 10 },
    ]);
  });

  it("names sources plainly and drops the site itself and test copies", () => {
    assert.deepEqual(
      m.sources.map((s) => s.name),
      ["Typed in, bookmarks, apps and email", "Google", "Instagram"],
    );
  });

  it("calls devices phones and computers, and skips unknown places", () => {
    assert.deepEqual(m.devices, [
      { kind: "computer", visits: 20 },
      { kind: "phone", visits: 10 },
    ]);
    assert.deepEqual(m.places, [{ code: "CA", visits: 20 }]);
  });
});

describe("plain words", () => {
  it("knows the usual places people come from", () => {
    assert.equal(sourceName("m.facebook.com", "barbart.ca"), "Facebook");
    assert.equal(sourceName("www.pinterest.ca", "barbart.ca"), "Pinterest");
    assert.equal(sourceName("someblog.com", "barbart.ca"), "someblog.com");
  });

  it("says how this month compares", () => {
    assert.equal(trendSentence(0, 0), "");
    assert.equal(trendSentence(20, 0), "Nothing to compare with yet.");
    assert.equal(
      trendSentence(105, 100),
      "About the same as the month before.",
    );
    assert.equal(trendSentence(120, 50), "Up from about 50 the month before.");
    assert.equal(trendSentence(20, 50), "Down from about 50 the month before.");
  });

  it("reads days, visits and countries", () => {
    assert.equal(dayLabel("2026-10-21"), "Oct 21");
    assert.equal(visitsLabel(0), "no visits");
    assert.equal(visitsLabel(50), "about 50 visits");
    assert.equal(countryName("CA"), "Canada");
  });

  it("draws quiet days as no bar and the busiest day full height", () => {
    const b = bars([0, 5, 10], 30, 80);
    assert.equal(b[0].h, 0);
    assert.equal(b[2].h, 80);
    assert.equal(b[1].h, 40);
  });
});
