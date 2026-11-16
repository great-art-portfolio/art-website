import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_IMAGE_CHARS,
  parseSuggestInput,
  parseSuggestion,
  SUGGESTION_SCHEMA,
  suggestWords,
  systemPrompt,
  userParts,
  voiceFrom,
} from "../../functions/_lib/suggest.ts";
import { onRequestGet, onRequestPost } from "../../functions/api/suggest.ts";

/** The writing helper, with fetch stubbed instead of calling Gemini. */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const IMAGE = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const KEY = "AQ.test-fake";
const GEMINI =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-4-hydrogen:generateContent";
/** Gemini's answer around some text. */
const answer = (text) =>
  Response.json({ candidates: [{ content: { parts: [{ text }] } }] });
const ideas = {
  titles: ["Night Water", "Blue Hollow", "Quiet Buds"],
  description: "Deep blue curves hold pale shapes.",
  alt: "Abstract painting with dark blue curves.",
};

function post(body, url = "http://127.0.0.1:4331/api/suggest") {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("parseSuggestInput", () => {
  it("keeps what the studio sends and trims it", () => {
    assert.deepEqual(
      parseSuggestInput({
        image: IMAGE,
        title: "  Thaw ",
        medium: "Oil",
        widthIn: 12,
        heightIn: 16,
        notes: "Bow River",
      }),
      {
        image: IMAGE,
        title: "Thaw",
        medium: "Oil",
        widthIn: 12,
        heightIn: 16,
        notes: "Bow River",
      },
    );
  });

  it("needs a photo as an image data URL", () => {
    assert.equal(parseSuggestInput({ title: "x" }), null);
    assert.equal(parseSuggestInput({ image: "https://x/y.jpg" }), null);
    assert.equal(
      parseSuggestInput({ image: "data:text/html;base64,PGI+" }),
      null,
    );
    assert.equal(
      parseSuggestInput({
        image: `data:image/jpeg;base64,${"A".repeat(MAX_IMAGE_CHARS)}`,
      }),
      null,
    );
  });

  it("drops sizes that aren't real inches", () => {
    const input = parseSuggestInput({
      image: IMAGE,
      widthIn: -3,
      heightIn: "9",
    });
    assert.equal(input?.widthIn, null);
    assert.equal(input?.heightIn, null);
  });
});

describe("userParts", () => {
  it("tells the model what she knows, then shows the photo inline", () => {
    const [text, image] = userParts({
      image: IMAGE,
      title: "",
      medium: "Acrylic",
      widthIn: 12,
      heightIn: 12,
      notes: "March light",
    });
    assert.match(text.text, /Medium: Acrylic/);
    assert.match(text.text, /Size: 12 × 12 in/);
    assert.match(text.text, /Her notes: March light/);
    assert.doesNotMatch(text.text, /Working title/);
    assert.deepEqual(image, {
      inlineData: { mimeType: "image/jpeg", data: "/9j/4AAQSkZJRg==" },
    });
  });
});

describe("parseSuggestion", () => {
  it("reads JSON inside a code fence", () => {
    assert.deepEqual(
      parseSuggestion("```json\n" + JSON.stringify(ideas) + "\n```"),
      ideas,
    );
  });

  it("strips quotes, drops repeats, and keeps three titles", () => {
    const out = parseSuggestion(
      JSON.stringify({
        titles: ['"Thaw"', "Thaw", "“Reeds”", "Bow", "Extra"],
        description: "Words.",
      }),
    );
    assert.deepEqual(out?.titles, ["Thaw", "Reeds", "Bow"]);
    assert.equal(out?.alt, "");
  });

  it("gives up on answers without a title or description", () => {
    assert.equal(parseSuggestion("Sorry, I can't help."), null);
    assert.equal(parseSuggestion('{"titles": [], "description": "x"}'), null);
    assert.equal(parseSuggestion('{"titles": ["x"]}'), null);
  });
});

describe("suggestWords", () => {
  it("asks Gemini 4 Hydrogen with the key and the photo inline, low thinking, JSON out", async () => {
    let sent;
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), GEMINI);
      assert.equal(init?.headers?.["x-goog-api-key"], KEY);
      sent = JSON.parse(String(init?.body));
      return answer(JSON.stringify(ideas));
    };
    const out = await suggestWords(
      { GEMINI_API_KEY: KEY },
      parseSuggestInput({ image: IMAGE, notes: "Bow River" }),
    );
    assert.deepEqual(out, ideas);
    assert.match(sent.systemInstruction.parts[0].text, /Barbara Straka/);
    assert.match(sent.systemInstruction.parts[0].text, /Reply with JSON only/);
    assert.equal(sent.contents.length, 1);
    assert.equal(sent.contents[0].role, "user");
    assert.match(sent.contents[0].parts[0].text, /Her notes: Bow River/);
    assert.deepEqual(sent.contents[0].parts[1], {
      inlineData: { mimeType: "image/jpeg", data: "/9j/4AAQSkZJRg==" },
    });
    assert.deepEqual(sent.generationConfig.thinkingConfig, {
      thinkingLevel: "low",
    });
    assert.deepEqual(sent.generationConfig.responseFormat, {
      text: { mimeType: "APPLICATION_JSON", schema: SUGGESTION_SCHEMA },
    });
    assert.equal(sent.tools, undefined);
    assert.equal(sent.generationConfig.temperature, undefined);
  });

  it("throws on a failed answer, naming Google's reason", async () => {
    globalThis.fetch = async () =>
      Response.json(
        { error: { code: 429, status: "RESOURCE_EXHAUSTED" } },
        { status: 429 },
      );
    await assert.rejects(
      suggestWords(
        { GEMINI_API_KEY: KEY },
        parseSuggestInput({ image: IMAGE }),
      ),
      /Google's free limit is used up \(429\)/,
    );
  });

  it("throws on an answer with no ideas in it, never asking another model", async () => {
    const urls = [];
    globalThis.fetch = async (url) => {
      urls.push(String(url));
      return Response.json({ candidates: [] });
    };
    await assert.rejects(
      suggestWords(
        { GEMINI_API_KEY: KEY, DEEPSEEK_API_KEY: "sk-test-fake" },
        parseSuggestInput({ image: IMAGE }),
      ),
      /Gemini sent no usable ideas/,
    );
    assert.deepEqual(urls, [GEMINI]);
  });
});

describe("/api/suggest", () => {
  it("reports whether the helper is set up", async () => {
    const get = (env) =>
      onRequestGet({
        request: new Request("http://127.0.0.1:4331/api/suggest"),
        env,
      }).then((r) => r.json());
    assert.deepEqual(await get({}), { enabled: false });
    // DeepSeek's key alone (translations) doesn't turn the helper on.
    assert.deepEqual(await get({ DEEPSEEK_API_KEY: "sk-test-fake" }), {
      enabled: false,
    });
    assert.deepEqual(await get({ GEMINI_API_KEY: KEY }), { enabled: true });
  });

  it("stays closed to the public", async () => {
    const res = await onRequestPost({
      request: post({ image: IMAGE }, "https://barbart.ca/api/suggest"),
      env: { GEMINI_API_KEY: KEY },
    });
    assert.equal(res.status, 401);
  });

  it("says how to turn it on without a key", async () => {
    globalThis.fetch = async () => {
      throw new Error("no call expected");
    };
    const res = await onRequestPost({
      request: post({ image: IMAGE }),
      env: {},
    });
    assert.equal(res.status, 501);
    assert.match((await res.json()).howToEnable, /GEMINI_API_KEY.*Google/);
  });

  it("asks for a photo, and answers with the ideas", async () => {
    const env = { GEMINI_API_KEY: KEY };
    const bad = await onRequestPost({ request: post({ title: "x" }), env });
    assert.equal(bad.status, 400);
    globalThis.fetch = async () => answer(JSON.stringify(ideas));
    const ok = await onRequestPost({ request: post({ image: IMAGE }), env });
    assert.deepEqual(await ok.json(), ideas);
  });

  it("turns a Gemini failure into plain words", async () => {
    globalThis.fetch = async () => new Response("down", { status: 503 });
    const res = await onRequestPost({
      request: post({ image: IMAGE }),
      env: { GEMINI_API_KEY: KEY },
    });
    assert.equal(res.status, 502);
    assert.match((await res.json()).error, /try again/);
  });

  it("says when Google's free limit is used up or the key fails", async () => {
    const failed = async (status, body = { error: { code: status } }) => {
      globalThis.fetch = async () => Response.json(body, { status });
      const res = await onRequestPost({
        request: post({ image: IMAGE }),
        env: { GEMINI_API_KEY: KEY },
      });
      assert.equal(res.status, 502);
      return (await res.json()).error;
    };
    assert.equal(
      await failed(429),
      "Google's free limit is used up for now — try again later.",
    );
    assert.match(await failed(403), /can't sign in/);
    assert.match(
      await failed(400, {
        error: {
          code: 400,
          status: "INVALID_ARGUMENT",
          details: [{ reason: "API_KEY_INVALID" }],
        },
      }),
      /can't sign in/,
    );
  });
});

describe("her voice", () => {
  const catalog = [
    { title: "Old One", description: "Older words.", added: "2026-01-01" },
    { title: "No Words", description: "", added: "2026-09-01" },
    ...Array.from({ length: 9 }, (_, i) => ({
      title: `New ${i}`,
      description: `Newer words ${i}.`,
      added: `2026-10-0${i + 1}`,
    })),
  ];

  it("learns from her newest eight descriptions and every title", () => {
    const voice = voiceFrom(catalog);
    assert.equal(voice.examples.length, 8);
    assert.equal(voice.examples[0].title, "New 8");
    assert.ok(!voice.examples.some((e) => e.title === "Old One"));
    assert.ok(!voice.examples.some((e) => e.title === "No Words"));
    assert.equal(voice.taken.length, catalog.length);
  });

  it("puts her words and taken titles in the prompt", () => {
    const prompt = systemPrompt(voiceFrom(catalog));
    assert.match(prompt, /“New 8”: Newer words 8\./);
    assert.match(prompt, /don't reuse or echo them: Old One, No Words/);
    // With no gallery yet, one example of hers still sets the tone.
    assert.match(
      systemPrompt({ examples: [], taken: [] }),
      /“Prairie Moon”: A pale moon/,
    );
  });

  it("reads the gallery from the build for every suggestion", async () => {
    let system = "";
    globalThis.fetch = async (_url, init) => {
      system = JSON.parse(init.body).systemInstruction.parts[0].text;
      return answer(JSON.stringify(ideas));
    };
    const res = await onRequestPost({
      request: post({ image: IMAGE }),
      env: {
        GEMINI_API_KEY: KEY,
        ASSETS: {
          fetch: async () =>
            Response.json({
              paintings: [
                {
                  slug: "shoreline",
                  title: "Shoreline",
                  priceCents: 15000,
                  sold: false,
                  file: "src/content/paintings/x.md",
                  description: "Pale blues curve like a shoreline.",
                  added: "2026-09-01",
                },
              ],
            }),
        },
      },
    });
    assert.equal(res.status, 200);
    assert.match(system, /“Shoreline”: Pale blues curve like a shoreline\./);
  });
});
