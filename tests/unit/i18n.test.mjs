import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cleanLocales,
  LOCALES,
  localePath,
  splitLocale,
} from "../../src/i18n/locales.ts";
import {
  formatTranslationFile,
  missingLocales,
  parseTranslationFile,
  sourceHash,
  translationPath,
} from "../../src/i18n/painting-text.ts";
import { en } from "../../src/i18n/en.ts";
import { fr } from "../../src/i18n/fr.ts";
import { es } from "../../src/i18n/es.ts";
import { pt } from "../../src/i18n/pt.ts";
import { de } from "../../src/i18n/de.ts";
import { it as itStrings } from "../../src/i18n/it.ts";
import { nl } from "../../src/i18n/nl.ts";
import { pl } from "../../src/i18n/pl.ts";
import { ja } from "../../src/i18n/ja.ts";
import { ko } from "../../src/i18n/ko.ts";
import { zh } from "../../src/i18n/zh.ts";
import { hi } from "../../src/i18n/hi.ts";
import { pa } from "../../src/i18n/pa.ts";
import {
  parseTranslateInput,
  parseTranslation,
  translateWords,
} from "../../functions/_lib/translate.ts";
import { formatDimensionsCm, sizeFor } from "../../src/lib/dims.ts";
import { buildMetrics } from "../../functions/_lib/metrics.ts";
import {
  GALLERY_PATH,
  isReadableFile,
} from "../../functions/_lib/gallery-paths.ts";

/** The translated site: paths per language, the words every language
 * must carry, and the painting translations the studio writes. */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("language paths", () => {
  it("puts other languages under their code and leaves English alone", () => {
    assert.equal(localePath("en", "/paintings/x"), "/paintings/x");
    assert.equal(localePath("fr", "/paintings/x"), "/fr/paintings/x");
    assert.equal(localePath("fr", "/"), "/fr");
    assert.equal(localePath("ja", "/#about"), "/ja#about");
  });

  it("reads the language back off a path", () => {
    assert.deepEqual(splitLocale("/fr/paintings/x"), {
      locale: "fr",
      path: "/paintings/x",
    });
    assert.deepEqual(splitLocale("/fr"), { locale: "fr", path: "/" });
    assert.deepEqual(splitLocale("/paintings/x"), {
      locale: "en",
      path: "/paintings/x",
    });
    // Two letters that aren't one of hers stay English.
    assert.deepEqual(splitLocale("/xx/y"), { locale: "en", path: "/xx/y" });
  });

  it("keeps only offered languages, in order, without English", () => {
    assert.deepEqual(cleanLocales(["ja", "en", "fr", "zz", 3]), ["fr", "ja"]);
    assert.deepEqual(cleanLocales("fr"), []);
  });
});

describe("every language's words", () => {
  const all = { fr, es, pt, de, it: itStrings, nl, pl, ja, ko, zh, hi, pa };

  /** Same keys, same array lengths, functions where English has them. */
  function sameShape(a, b, at) {
    if (typeof a === "function") {
      assert.equal(typeof b, "function", at);
      return;
    }
    if (Array.isArray(a)) {
      assert.ok(Array.isArray(b), at);
      assert.equal(b.length, a.length, at);
      a.forEach((x, i) => sameShape(x, b[i], `${at}[${i}]`));
      return;
    }
    if (typeof a === "object") {
      assert.deepEqual(Object.keys(b).sort(), Object.keys(a).sort(), at);
      for (const k of Object.keys(a)) sameShape(a[k], b[k], `${at}.${k}`);
      return;
    }
    assert.equal(typeof b, "string", at);
    assert.notEqual(b.trim(), "", `${at} is empty`);
    // Markup survives translation: the same number of <strong>s.
    assert.equal(
      (b.match(/<strong>/g) ?? []).length,
      (a.match(/<strong>/g) ?? []).length,
      `${at} lost its <strong>`,
    );
  }

  for (const [code, words] of Object.entries(all)) {
    it(`${code} has every line English has`, () => {
      sameShape(en, words, code);
      assert.equal(typeof words.gallery.count(3), "string");
      assert.match(words.painting.buyNow("$140 CAD"), /\$140 CAD/);
      assert.match(words.meta.paintingTitle("X", false), /X/);
    });
  }

  it("covers every offered language", () => {
    assert.deepEqual(
      Object.keys(all).sort(),
      LOCALES.map((l) => l.code)
        .filter((c) => c !== "en")
        .sort(),
    );
  });

  it("counts Polish works with the right plural", () => {
    assert.notEqual(pl.gallery.count(2), pl.gallery.count(5));
    assert.equal(
      pl.gallery.count(12).replace("12", ""),
      pl.gallery.count(5).replace("5", ""),
    );
  });
});

describe("painting translation files", () => {
  const english = {
    title: "Prairie Moon",
    description: "A pale moon.",
    alt: "A moon",
    medium: "",
  };
  const french = {
    title: "Lune des prairies",
    description: "Une lune pâle.",
    alt: "Une lune",
    medium: "",
  };

  it("sits beside the painting by file name", () => {
    assert.equal(
      translationPath("src/content/paintings/img_5667.md"),
      "src/content/translations/img_5667.json",
    );
  });

  it("round-trips and drops what it doesn't know", () => {
    const text = formatTranslationFile({
      source: sourceHash(english),
      langs: { fr: french },
    });
    const back = parseTranslationFile({ ...JSON.parse(text), zz: french });
    assert.deepEqual(back, {
      source: sourceHash(english),
      langs: { fr: french },
    });
    assert.deepEqual(parseTranslationFile(null), { source: "", langs: {} });
  });

  it("asks only for missing languages while the English is unchanged", () => {
    const file = { source: sourceHash(english), langs: { fr: french } };
    assert.deepEqual(missingLocales(file, english, ["fr", "ja"]), ["ja"]);
    // Changed English: everything again.
    assert.deepEqual(
      missingLocales(file, { ...english, title: "Night Moon" }, ["fr", "ja"]),
      ["fr", "ja"],
    );
  });

  it("changes the hash with any of her words", () => {
    const h = sourceHash(english);
    for (const key of ["title", "description", "alt", "medium"])
      assert.notEqual(sourceHash({ ...english, [key]: "changed" }), h, key);
  });
});

describe("translate", () => {
  it("needs a title and at least one language", () => {
    assert.equal(
      parseTranslateInput({ words: { title: "" }, locales: ["fr"] }),
      null,
    );
    assert.equal(
      parseTranslateInput({ words: { title: "X" }, locales: ["en"] }),
      null,
    );
    assert.deepEqual(
      parseTranslateInput({ words: { title: " X " }, locales: ["ja", "fr"] }),
      {
        kind: "painting",
        words: { title: "X", description: "", alt: "", medium: "" },
        locales: ["fr", "ja"],
      },
    );
  });

  it("reads the model's JSON, fenced or not, and keeps empty fields empty", () => {
    const out = parseTranslation(
      '```json\n{"fr": {"title": "Lune", "description": "Une lune.", "alt": "x", "medium": "Huile"}, "ja": {"title": ""}}\n```',
      ["fr", "ja"],
      { title: "Moon", description: "A moon.", alt: "a", medium: "" },
    );
    assert.deepEqual(out, {
      fr: { title: "Lune", description: "Une lune.", alt: "x", medium: "" },
    });
    assert.deepEqual(
      parseTranslation("no json", ["fr"], {
        title: "M",
        description: "",
        alt: "",
        medium: "",
      }),
      {},
    );
  });

  it("asks four languages at a time and keeps what came back", async () => {
    const asked = [];
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(init.body);
      const codes = [
        ...body.messages[1].content.matchAll(/\b([a-z]{2}) \(/g),
      ].map((m) => m[1]);
      asked.push(codes);
      if (codes.includes("ja")) return new Response("down", { status: 503 });
      const reply = Object.fromEntries(
        codes.map((c) => [c, { title: `T-${c}` }]),
      );
      return Response.json({
        choices: [{ message: { content: JSON.stringify(reply) } }],
      });
    };
    const out = await translateWords(
      { MUSE_API_KEY: "k" },
      {
        kind: "painting",
        words: { title: "Moon", description: "", alt: "", medium: "" },
        locales: ["fr", "es", "pt", "de", "it", "nl", "pl", "ja", "ko"],
      },
    );
    assert.equal(asked.length, 3);
    assert.ok(asked.every((g) => g.length <= 4));
    // The group with Japanese failed; the others still came back.
    assert.equal(out.fr.title, "T-fr");
    assert.equal(out.ja, undefined);
    assert.equal(out.it, undefined);
    assert.equal(out.ko.title, "T-ko");
  });

  it("throws when nothing came back", async () => {
    globalThis.fetch = async () => new Response("down", { status: 503 });
    await assert.rejects(
      translateWords(
        { MUSE_API_KEY: "k" },
        {
          kind: "banner",
          words: { title: "Open studio", description: "", alt: "", medium: "" },
          locales: ["fr"],
        },
      ),
    );
  });
});

describe("sizes abroad", () => {
  it("gives centimetres, with inches after on the painting page", () => {
    assert.equal(formatDimensionsCm(36, 36, 1.5), "91 × 91 × 3.8 cm");
    assert.equal(sizeFor("en", 24, 36, null), "24 × 36 in");
    assert.equal(sizeFor("fr", 24, 36, null), "61 × 91 cm");
    assert.equal(sizeFor("fr", 24, 36, null, true), "61 × 91 cm (24 × 36 in)");
    assert.equal(sizeFor("fr", null, 36, null), "");
  });
});

describe("metrics across languages", () => {
  it("counts every language's copy as the same painting", () => {
    const m = buildMetrics(
      {
        days: [],
        before: [],
        pages: [
          { count: 5, dimensions: { requestPath: "/paintings/night-reeds" } },
          {
            count: 2,
            dimensions: { requestPath: "/fr/paintings/night-reeds" },
          },
        ],
        sources: [],
        places: [],
        devices: [],
      },
      { from: new Date("2026-10-01"), to: new Date("2026-10-02") },
      "barbart.ca",
    );
    assert.deepEqual(m.paintings, [{ slug: "night-reeds", views: 7 }]);
  });
});

describe("studio file rules", () => {
  it("lets the studio read and write translations and the language list", () => {
    assert.ok(isReadableFile("src/content/translations/img_5667.json"));
    assert.ok(isReadableFile("src/content/languages.json"));
    assert.ok(!isReadableFile("src/content/translations/../x.json"));
    assert.ok(GALLERY_PATH.test("src/content/translations/img_5667.json"));
    assert.ok(GALLERY_PATH.test("src/content/languages.json"));
    assert.ok(!GALLERY_PATH.test("src/content/other.json"));
  });
});

describe("POST /api/translate", () => {
  it("stays on this machine for local requests", async () => {
    const { onRequestPost } = await import("../../functions/api/translate.ts");
    globalThis.fetch = async () => {
      throw new Error("no call expected");
    };
    const res = await onRequestPost({
      request: new Request("http://localhost:4331/api/translate", {
        method: "POST",
        body: JSON.stringify({ words: { title: "X" }, locales: ["fr"] }),
      }),
      env: { MUSE_API_KEY: "k" },
    });
    assert.equal(res.status, 501);
  });
});
