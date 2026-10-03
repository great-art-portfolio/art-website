import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  __resetTurnstileCache,
  ensureTurnstile,
  takeTurnstileToken,
} from "../../src/lib/turnstile-widget.ts";

/**
 * Tokens are single-use. Each send takes its own, the widget resets for
 * the next, and a send made while the check is still loading waits for it.
 * Browser globals are stubbed: a fake mount and a fake Turnstile API.
 */

const realFetch = globalThis.fetch;
let rendered;
let resets;

class FakeElement {
  dataset = {};
}

function stubBrowser(siteKey) {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ turnstileSiteKey: siteKey }),
  });
  globalThis.HTMLElement = FakeElement;
  const mount = new FakeElement();
  globalThis.document = {
    // The script tag "already loaded", so no CDN is touched.
    getElementById: (id) => (id === "turnstile-script" ? {} : null),
    querySelector: () => mount,
  };
  globalThis.window = {
    turnstile: {
      render: (_selector, options) => {
        rendered = options;
        return "w1";
      },
      reset: (id) => resets.push(id),
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  __resetTurnstileCache();
  rendered = null;
  resets = [];
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.HTMLElement;
  __resetTurnstileCache();
});

describe("takeTurnstileToken", () => {
  it("is empty right away when Turnstile is off", async () => {
    stubBrowser("");
    assert.equal(await takeTurnstileToken("#m", 50), "");
  });

  it("hands each send its own token and resets for the next", async () => {
    stubBrowser("pk");
    ensureTurnstile("#m");
    await tick();
    await tick();
    rendered.callback("t1");
    assert.equal(await takeTurnstileToken("#m", 50), "t1");
    assert.deepEqual(resets, ["w1"]);
    // The spent token is never handed out twice.
    const second = takeTurnstileToken("#m", 1000);
    await tick();
    rendered.callback("t2");
    assert.equal(await second, "t2");
  });

  it("waits for a check that is still loading", async () => {
    stubBrowser("pk");
    const pending = takeTurnstileToken("#m", 1000);
    ensureTurnstile("#m");
    await tick();
    await tick();
    rendered.callback("late");
    assert.equal(await pending, "late");
  });

  it("gives up after the wait so the page can ask for the check", async () => {
    stubBrowser("pk");
    ensureTurnstile("#m");
    await tick();
    assert.equal(await takeTurnstileToken("#m", 20), "");
    // A token that arrives afterwards is kept for the retry.
    rendered.callback("t3");
    assert.equal(await takeTurnstileToken("#m", 20), "t3");
  });

  it("doesn't wait when the widget script is blocked", async () => {
    stubBrowser("pk");
    globalThis.window = {};
    const started = Date.now();
    assert.equal(await takeTurnstileToken("#m", 5000), "");
    assert.ok(Date.now() - started < 1000);
  });
});
