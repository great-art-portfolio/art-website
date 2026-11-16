import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  askDeepSeek,
  DEEPSEEK_MODEL,
  DEEPSEEK_URL,
  DeepSeekError,
  deepseekEnabled,
  deepseekProblem,
} from "../../functions/_lib/deepseek.ts";

/** The one DeepSeek call, with fetch stubbed: never the real API. */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const KEY = "sk-test-fake";
const ask = (env = { DEEPSEEK_API_KEY: KEY }) =>
  askDeepSeek(env, [{ role: "user", content: "Hi" }], 5_000);

describe("askDeepSeek", () => {
  it("posts a quick chat completion: the key, deepseek-flash, thinking off", async () => {
    let seen;
    globalThis.fetch = async (url, init) => {
      seen = { url: String(url), init, body: JSON.parse(String(init.body)) };
      return Response.json({ choices: [{ message: { content: "Hello" } }] });
    };
    assert.equal(await ask(), "Hello");
    assert.equal(seen.url, "https://api.deepseek.com/chat/completions");
    assert.equal(seen.url, DEEPSEEK_URL);
    assert.equal(seen.init.method, "POST");
    assert.equal(seen.init.headers.Authorization, `Bearer ${KEY}`);
    assert.equal(seen.body.model, "deepseek-flash");
    assert.equal(DEEPSEEK_MODEL, "deepseek-flash");
    assert.deepEqual(seen.body.thinking, { type: "disabled" });
    assert.equal(seen.body.tools, undefined);
    assert.deepEqual(seen.body.messages, [{ role: "user", content: "Hi" }]);
  });

  it("takes a model override from DEEPSEEK_MODEL", async () => {
    let model;
    globalThis.fetch = async (_url, init) => {
      model = JSON.parse(String(init.body)).model;
      return Response.json({ choices: [{ message: { content: "x" } }] });
    };
    await ask({ DEEPSEEK_API_KEY: KEY, DEEPSEEK_MODEL: "other-model" });
    assert.equal(model, "other-model");
  });

  it("answers null when the reply has no text", async () => {
    globalThis.fetch = async () => Response.json({ choices: [] });
    assert.equal(await ask(), null);
    globalThis.fetch = async () =>
      Response.json({ choices: [{ message: { content: null } }] });
    assert.equal(await ask(), null);
  });

  it("throws DeepSeek's status in words an agent can act on", async () => {
    for (const [status, words] of [
      [401, /rejected the key \(401\).*DEEPSEEK_API_KEY/],
      [402, /balance is used up \(402\).*platform\.deepseek\.com/],
      [429, /rate-limiting \(429\)/],
      [503, /DeepSeek answered 503/],
    ]) {
      globalThis.fetch = async () => new Response("{}", { status });
      await assert.rejects(ask(), (err) => {
        assert.ok(err instanceof DeepSeekError);
        assert.equal(err.status, status);
        assert.match(err.message, words);
        return true;
      });
    }
  });
});

describe("deepseekEnabled", () => {
  it("is on only with a key", () => {
    assert.equal(deepseekEnabled({}), false);
    assert.equal(deepseekEnabled({ DEEPSEEK_API_KEY: "" }), false);
    assert.equal(deepseekEnabled({ DEEPSEEK_API_KEY: KEY }), true);
  });

  it("words the prepaid balance for the owner", () => {
    assert.match(deepseekProblem(402), /top up at platform\.deepseek\.com/);
  });
});
