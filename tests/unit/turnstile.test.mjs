import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { turnstileOk } from "../../functions/_lib/turnstile.ts";

/**
 * Backend siteverify requests, with fetch stubbed instead of calling
 * Cloudflare. Extensionless imports resolve through the test-only loader.
 */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubSiteverify(answer) {
  globalThis.fetch = async (url, init) => {
    assert.equal(
      String(url),
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    );
    assert.equal(init?.method, "POST");
    assert.equal(
      init?.headers?.["Content-Type"],
      "application/x-www-form-urlencoded",
    );
    const form = new URLSearchParams(String(init?.body));
    assert.equal(form.get("secret"), "shh");
    assert.ok((form.get("response") ?? "").length > 0);
    return { json: async () => answer };
  };
}

describe("turnstileOk", () => {
  it("passes without a secret (honeypot-only local/dev)", async () => {
    assert.equal(await turnstileOk({}, "", null), true);
  });

  it("refuses without a secret once deployed, but not on this machine", async () => {
    const at = (url) => new Request(url, { method: "POST" });
    assert.equal(
      await turnstileOk({}, "", null, at("https://barbart.ca/api/inquiries")),
      false,
    );
    assert.equal(
      await turnstileOk(
        {},
        "",
        null,
        at("https://branch.art-website-cm4.pages.dev/api/inquiries"),
      ),
      false,
    );
    assert.equal(
      await turnstileOk(
        {},
        "",
        null,
        at("http://127.0.0.1:4331/api/inquiries"),
      ),
      true,
    );
  });

  it("rejects empty and oversize tokens before calling siteverify", async () => {
    let called = 0;
    globalThis.fetch = async () => {
      called += 1;
      return { json: async () => ({ success: true }) };
    };
    const env = { TURNSTILE_SECRET_KEY: "shh" };
    assert.equal(await turnstileOk(env, "", null), false);
    assert.equal(await turnstileOk(env, "x".repeat(2049), null), false);
    assert.equal(called, 0);
  });

  it("passes when siteverify succeeds", async () => {
    stubSiteverify({
      success: true,
      hostname: "barbart.ca",
      action: "inquiry",
    });
    assert.equal(
      await turnstileOk({ TURNSTILE_SECRET_KEY: "shh" }, "tok", "1.2.3.4"),
      true,
    );
  });

  it("fails when siteverify rejects", async () => {
    stubSiteverify({
      success: false,
      "error-codes": ["invalid-input-response"],
    });
    assert.equal(
      await turnstileOk({ TURNSTILE_SECRET_KEY: "shh" }, "bogus", null),
      false,
    );
  });

  it("fails closed on network errors", async () => {
    globalThis.fetch = () => Promise.reject(new Error("offline"));
    assert.equal(
      await turnstileOk({ TURNSTILE_SECRET_KEY: "shh" }, "tok", null),
      false,
    );
  });
});

describe("public forms with Turnstile on", async () => {
  const { onRequestPost: inquire } =
    await import("../../functions/api/inquiries.ts");
  const { onRequestPost: collect } =
    await import("../../functions/api/collectors.ts");
  const env = {
    TURNSTILE_SECRET_KEY: "shh",
    RESEND_API_KEY: "re_test",
    RESEND_SEGMENT_ID: "seg_123",
    ARTIST_INBOX: "studio@example.com",
  };
  const post = (handler, path, body) =>
    handler({
      request: new Request(`https://barbart.ca${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    });

  // 403, not 400: the page asks the visitor to finish the check, and the
  // offline outbox keeps a saved note instead of dropping it as bad input.
  it("answers a missing check with 403 and sends nothing", async () => {
    let sent = 0;
    globalThis.fetch = async () => {
      sent += 1;
      return { ok: true, json: async () => ({}) };
    };
    const inquiry = await post(inquire, "/api/inquiries", {
      paintingTitle: "First Thaw",
      name: "Ada",
      email: "ada@example.com",
    });
    assert.equal(inquiry.status, 403);
    const join = await post(collect, "/api/collectors", {
      email: "ada@example.com",
    });
    assert.equal(join.status, 403);
    const leave = await post(collect, "/api/collectors", {
      action: "unsubscribe",
      email: "ada@example.com",
    });
    assert.equal(leave.status, 403);
    assert.equal(sent, 0);
  });

  it("still rejects bad input with 400 once the check passes", async () => {
    globalThis.fetch = async () => ({ json: async () => ({ success: true }) });
    const res = await post(inquire, "/api/inquiries", {
      paintingTitle: "First Thaw",
      name: "Ada",
      email: "not-an-email",
      turnstileToken: "tok",
    });
    assert.equal(res.status, 400);
  });
});

describe("status hands out the site key", async () => {
  const { onRequestGet } = await import("../../functions/api/status.ts");
  const keyFor = async (env) =>
    (await (await onRequestGet({ env })).json()).turnstileSiteKey;

  it("only once the secret is set, so the widget never shows unchecked", async () => {
    assert.equal(await keyFor({ TURNSTILE_SITE_KEY: "0xSite" }), "");
    assert.equal(
      await keyFor({
        TURNSTILE_SITE_KEY: "0xSite",
        TURNSTILE_SECRET_KEY: "shh",
      }),
      "0xSite",
    );
  });
});

describe("inquiries name only real paintings", async () => {
  const { onRequestPost: inquire } =
    await import("../../functions/api/inquiries.ts");
  const catalog = {
    paintings: [
      {
        slug: "first-thaw",
        title: "First Thaw",
        priceCents: 12500,
        sold: false,
        file: "src/content/paintings/1943x1967.md",
      },
    ],
  };
  const send = (body) => {
    const mails = [];
    globalThis.fetch = async (url, init) => {
      if (String(url).startsWith("https://challenges.cloudflare.com/"))
        return Response.json({ success: true });
      mails.push(JSON.parse(init.body));
      return Response.json({ id: "e1" });
    };
    return inquire({
      request: new Request("https://barbart.ca/api/inquiries", {
        method: "POST",
        body: JSON.stringify({
          name: "Ada",
          email: "ada@resend.dev",
          turnstileToken: "tok",
          ...body,
        }),
      }),
      env: {
        TURNSTILE_SECRET_KEY: "shh",
        RESEND_API_KEY: "re_x",
        ARTIST_INBOX: "artist@resend.dev",
        ASSETS: { fetch: async () => Response.json(catalog) },
      },
    }).then(async (res) => ({ res, mails }));
  };

  it("takes the title and price from the catalog, not the browser", async () => {
    const { res, mails } = await send({
      slug: "first-thaw",
      paintingTitle: "URGENT: verify your bank",
      priceCents: 1,
    });
    assert.equal(res.status, 201);
    assert.equal(mails[0].subject, 'New message about "First Thaw"');
    assert.match(mails[0].text, /\$125 CAD/);
  });

  it("refuses a painting that isn't on the site", async () => {
    const { res, mails } = await send({ paintingTitle: "Made Up" });
    assert.equal(res.status, 400);
    assert.equal(mails.length, 0);
  });

  it("still takes an older page's note by its exact title", async () => {
    const { res } = await send({ paintingTitle: "First Thaw" });
    assert.equal(res.status, 201);
  });
});
