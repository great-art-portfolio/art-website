import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  askGemini,
  GEMINI_MODEL,
  GeminiError,
  geminiEnabled,
  geminiProblem,
} from "../../functions/_lib/gemini.ts";

/** The one Gemini call, with fetch stubbed: never the real API. */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const KEY = "AQ.test-fake";
const ask = (env = { GEMINI_API_KEY: KEY }) =>
  askGemini(
    env,
    {
      system: "Be brief.",
      parts: [{ text: "Hi" }],
      schema: { type: "string" },
    },
    5_000,
  );

describe("askGemini", () => {
  it("posts generateContent to gemini-4-hydrogen: the key in its header, low thinking, the schema", async () => {
    let seen;
    globalThis.fetch = async (url, init) => {
      seen = { url: String(url), init, body: JSON.parse(String(init.body)) };
      return Response.json({
        candidates: [{ content: { parts: [{ text: "Hello" }] } }],
      });
    };
    assert.equal(await ask(), "Hello");
    assert.equal(GEMINI_MODEL, "gemini-4-hydrogen");
    assert.equal(
      seen.url,
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-4-hydrogen:generateContent",
    );
    assert.equal(seen.init.method, "POST");
    assert.equal(seen.init.headers["x-goog-api-key"], KEY);
    assert.equal(seen.init.headers.Authorization, undefined);
    assert.ok(!seen.url.includes(KEY), "the key never rides in the URL");
    assert.deepEqual(seen.body, {
      systemInstruction: { parts: [{ text: "Be brief." }] },
      contents: [{ role: "user", parts: [{ text: "Hi" }] }],
      generationConfig: {
        thinkingConfig: { thinkingLevel: "low" },
        responseFormat: {
          text: { mimeType: "APPLICATION_JSON", schema: { type: "string" } },
        },
      },
    });
  });

  it("joins the answer's text and leaves its thoughts out", async () => {
    globalThis.fetch = async () =>
      Response.json({
        candidates: [
          {
            content: {
              parts: [
                { text: "thinking…", thought: true },
                { text: '{"a":' },
                { text: "1}", thoughtSignature: "sig" },
              ],
            },
          },
        ],
      });
    assert.equal(await ask(), '{"a":1}');
  });

  it("answers null when the reply has no text (a blocked prompt, say)", async () => {
    globalThis.fetch = async () =>
      Response.json({ promptFeedback: { blockReason: "OTHER" } });
    assert.equal(await ask(), null);
    globalThis.fetch = async () =>
      Response.json({ candidates: [{ content: { parts: [] } }] });
    assert.equal(await ask(), null);
  });

  it("throws Google's status and reason in words an agent can act on", async () => {
    for (const [status, body, words] of [
      [
        400,
        { error: { details: [{ reason: "API_KEY_INVALID" }] } },
        /rejected the key \(400\).*GEMINI_API_KEY/,
      ],
      [
        403,
        { error: { status: "PERMISSION_DENIED" } },
        /refused the key \(403\)/,
      ],
      [
        429,
        { error: { status: "RESOURCE_EXHAUSTED" } },
        /free limit is used up \(429\)/,
      ],
      [503, "not json", /Gemini answered 503/],
    ]) {
      globalThis.fetch = async () =>
        typeof body === "string"
          ? new Response(body, { status })
          : Response.json(body, { status });
      await assert.rejects(ask(), (err) => {
        assert.ok(err instanceof GeminiError);
        assert.equal(err.status, status);
        assert.match(err.message, words);
        assert.ok(!err.message.includes(KEY));
        return true;
      });
    }
  });
});

describe("geminiEnabled", () => {
  it("is on only with a key", () => {
    assert.equal(geminiEnabled({}), false);
    assert.equal(geminiEnabled({ GEMINI_API_KEY: "" }), false);
    assert.equal(geminiEnabled({ DEEPSEEK_API_KEY: "sk-test-fake" }), false);
    assert.equal(geminiEnabled({ GEMINI_API_KEY: KEY }), true);
  });

  it("names the daily reset for a 429", () => {
    assert.match(geminiProblem(429), /midnight Pacific/);
  });
});
