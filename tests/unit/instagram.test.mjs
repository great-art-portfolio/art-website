import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  INSTAGRAM_PATH,
  normalizeInstagramHandle,
  parseInstagram,
  readInstagram,
} from "../../src/lib/instagram.ts";

describe("parseInstagram", () => {
  it("exposes the expected content path", () => {
    assert.equal(INSTAGRAM_PATH, "src/content/instagram.txt");
  });

  it("treats blank, invisible-mark, or @-only input as unset", () => {
    for (const empty of [
      "",
      "   ",
      "\n",
      "@",
      "@@@",
      "  @  ",
      "\u200B",
      "\u200E\uFEFF",
    ]) {
      const res = parseInstagram(empty);
      assert.deepEqual(res, { ok: true, value: null }, JSON.stringify(empty));
    }
  });

  it("normalizes typed handles while preserving letter case and stripping invisible marks", () => {
    assert.deepEqual(parseInstagram("barbarastraka"), {
      ok: true,
      value: {
        username: "barbarastraka",
        handle: "@barbarastraka",
        url: "https://www.instagram.com/barbarastraka/",
      },
    });
    assert.deepEqual(parseInstagram("@@Barbara.Straka_1"), {
      ok: true,
      value: {
        username: "Barbara.Straka_1",
        handle: "@Barbara.Straka_1",
        url: "https://www.instagram.com/Barbara.Straka_1/",
      },
    });
    assert.deepEqual(parseInstagram("@barbarastraka\u200E"), {
      ok: true,
      value: {
        username: "barbarastraka",
        handle: "@barbarastraka",
        url: "https://www.instagram.com/barbarastraka/",
      },
    });
    assert.deepEqual(parseInstagram("\u200Bbarbarastraka"), {
      ok: true,
      value: {
        username: "barbarastraka",
        handle: "@barbarastraka",
        url: "https://www.instagram.com/barbarastraka/",
      },
    });
    assert.deepEqual(parseInstagram("a"), {
      ok: true,
      value: {
        username: "a",
        handle: "@a",
        url: "https://www.instagram.com/a/",
      },
    });
    for (const u of [
      "_barbarastraka",
      "barbarastraka_",
      "_barbara_art_",
      "_",
    ]) {
      assert.deepEqual(parseInstagram(u), {
        ok: true,
        value: {
          username: u,
          handle: `@${u}`,
          url: `https://www.instagram.com/${u}/`,
        },
      });
    }
    const thirty = "a".repeat(28) + "9z";
    assert.deepEqual(parseInstagram(thirty), {
      ok: true,
      value: {
        username: thirty,
        handle: `@${thirty}`,
        url: `https://www.instagram.com/${thirty}/`,
      },
    });
  });

  it("extracts profile usernames from Instagram URLs and strips query params", () => {
    const urls = [
      ["https://instagram.com/barbara_art", "barbara_art"],
      ["http://www.instagram.com/barbara_art/?hl=en", "barbara_art"],
      [
        "https://www.instagram.com/Barbara.Straka/?igsh=abc123&utm_source=qr#top",
        "Barbara.Straka",
      ],
      ["https://m.instagram.com/@straka.studio/", "straka.studio"],
      ["instagr.am/straka.paintings/", "straka.paintings"],
      ["instagram.com/straka.paintings/reels/", "straka.paintings"],
      [
        "https://www.instagram.com/stories/barbara_art/1234567890/",
        "barbara_art",
      ],
    ];
    for (const [input, username] of urls) {
      const res = parseInstagram(input);
      assert.deepEqual(
        res,
        {
          ok: true,
          value: {
            username,
            handle: `@${username}`,
            url: `https://www.instagram.com/${username}/`,
          },
        },
        input,
      );
    }
  });

  it("rejects non-profile Instagram links, highlights, other domains, emails, and illegal usernames", () => {
    const bad = [
      "https://www.instagram.com/",
      "instagram.com",
      "https://www.instagram.com/@/",
      "https://www.instagram.com/p/C8x123/",
      "https://www.instagram.com/reel/XYZ987/",
      "https://www.instagram.com/reels/XYZ987/",
      "https://www.instagram.com/explore/tags/painting/",
      "https://www.instagram.com/accounts/login/",
      "https://www.instagram.com/stories/",
      "https://www.instagram.com/stories/highlights/17890/",
      "https://www.instagram.com/highlights/",
      "https://facebook.com/barbarastraka",
      "www.tiktok.com/@barbarastraka",
      "example.com/barbarastraka",
      "javascript:alert(1)",
      "barbara@gmail.com",
      "a".repeat(31),
      "barbara-straka",
      "barbara straka",
      "barbara!",
      ".barbara",
      "barbara.",
      "barbara..straka",
      ".",
    ];
    for (const raw of bad) {
      const res = parseInstagram(raw);
      assert.equal(res.ok, false, raw);
      if (!res.ok) assert.ok(res.error.length > 0, raw);
    }
  });
});

describe("normalizeInstagramHandle & readInstagram", () => {
  it("returns empty or null for blank and invalid values", () => {
    assert.equal(normalizeInstagramHandle(""), "");
    assert.equal(normalizeInstagramHandle("https://instagram.com/p/123/"), "");
    assert.equal(readInstagram(""), null);
    assert.equal(readInstagram("barbara@gmail.com"), null);
  });

  it("returns formatted handle and parsed profile for valid input", () => {
    assert.equal(
      normalizeInstagramHandle("https://instagram.com/barbara_yyc/?hl=en"),
      "@barbara_yyc",
    );
    assert.deepEqual(readInstagram("@barbara_yyc"), {
      username: "barbara_yyc",
      handle: "@barbara_yyc",
      url: "https://www.instagram.com/barbara_yyc/",
    });
  });
});
