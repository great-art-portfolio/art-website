import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_IMAGE_CHARS,
  MUSE_URL,
  parseSuggestInput,
  parseSuggestion,
  suggestWords,
  systemPrompt,
  userContent,
  voiceFrom,
} from "../../functions/_lib/suggest.ts";
import { onRequestGet, onRequestPost } from "../../functions/api/suggest.ts";

/** The writing helper, with fetch stubbed instead of calling Muse. */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const IMAGE = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
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

describe("userContent", () => {
  it("tells the model what she knows, then shows the photo", () => {
    const [text, image] = userContent({
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
    assert.deepEqual(image, { type: "image_url", image_url: { url: IMAGE } });
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
  it("asks Muse with the key, the photo, and low effort", async () => {
    let sent;
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), MUSE_URL);
      assert.equal(init?.headers?.Authorization, "Bearer k");
      sent = JSON.parse(String(init?.body));
      return Response.json({
        choices: [{ message: { content: JSON.stringify(ideas) } }],
      });
    };
    const out = await suggestWords(
      { MUSE_API_KEY: "k" },
      parseSuggestInput({ image: IMAGE }),
    );
    assert.deepEqual(out, ideas);
    assert.equal(sent.model, "muse-spark-1.3-contributor");
    assert.equal(sent.reasoning_effort, "low");
    assert.equal(sent.messages[0].role, "system");
    assert.equal(sent.messages[1].content[1].image_url.url, IMAGE);
  });

  it("throws on a failed answer", async () => {
    globalThis.fetch = async () => new Response("nope", { status: 429 });
    await assert.rejects(
      suggestWords({ MUSE_API_KEY: "k" }, parseSuggestInput({ image: IMAGE })),
      /429/,
    );
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
    assert.deepEqual(await get({ MUSE_API_KEY: "k" }), { enabled: true });
  });

  it("stays closed to the public", async () => {
    const res = await onRequestPost({
      request: post({ image: IMAGE }, "https://barbart.ca/api/suggest"),
      env: { MUSE_API_KEY: "k" },
    });
    assert.equal(res.status, 401);
  });

  it("says how to turn it on without a key", async () => {
    const res = await onRequestPost({
      request: post({ image: IMAGE }),
      env: {},
    });
    assert.equal(res.status, 501);
  });

  it("asks for a photo, and answers with the ideas", async () => {
    const env = { MUSE_API_KEY: "k" };
    const bad = await onRequestPost({ request: post({ title: "x" }), env });
    assert.equal(bad.status, 400);
    globalThis.fetch = async () =>
      Response.json({
        choices: [{ message: { content: JSON.stringify(ideas) } }],
      });
    const ok = await onRequestPost({ request: post({ image: IMAGE }), env });
    assert.deepEqual(await ok.json(), ideas);
  });

  it("turns a Muse failure into plain words", async () => {
    globalThis.fetch = async () => new Response("down", { status: 503 });
    const res = await onRequestPost({
      request: post({ image: IMAGE }),
      env: { MUSE_API_KEY: "k" },
    });
    assert.equal(res.status, 502);
    assert.match((await res.json()).error, /try again/);
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
      system = JSON.parse(init.body).messages[0].content;
      return Response.json({
        choices: [{ message: { content: JSON.stringify(ideas) } }],
      });
    };
    const res = await onRequestPost({
      request: post({ image: IMAGE }),
      env: {
        MUSE_API_KEY: "k",
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
