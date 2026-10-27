import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { onRequestGet, onRequestPost } from "../../functions/api/notify.ts";

/** The studio's email to her list: the standard publish alert, or the
 * Email page's own subject and body. */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const env = { ADMIN_API_TOKEN: "admin" };
const call = (body) =>
  onRequestPost({
    request: new Request("https://barbart.ca/api/notify", {
      method: "POST",
      headers: { authorization: "Bearer admin" },
      body: JSON.stringify(body),
    }),
    env,
  });

describe("POST /api/notify", () => {
  it("answers with what the email reached, and nothing about browsers", async () => {
    // No mail configured: it reports an unsent email instead of failing.
    const res = await call({ email: true });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      emailed: false,
      emailTotal: 0,
      scheduled: false,
      failed: false,
    });
  });

  it("sends nothing when the email is switched off", async () => {
    globalThis.fetch = async () => {
      throw new Error("no call expected");
    };
    const res = await call({ email: false });
    assert.deepEqual(await res.json(), { emailed: false, emailTotal: 0 });
  });

  it("needs the studio's sign-in", async () => {
    const res = await onRequestPost({
      request: new Request("https://barbart.ca/api/notify", {
        method: "POST",
        body: "{}",
      }),
      env,
    });
    assert.equal(res.status, 401);
  });
});

describe("POST /api/notify for a painting", () => {
  const md = [
    "---",
    'title: "Prairie Moon"',
    "price: 140.00",
    'alt: "A pale moon over white cliffs"',
    "widthIn: 24",
    "heightIn: 36",
    'medium: "Acrylic on canvas"',
    "---",
    "A pale moon hangs over stacked bands of white cliff.",
    "",
  ].join("\n");
  const mailEnv = (catalog) => ({
    ...env,
    ALERTS_TOKEN: "nightly",
    GITHUB_REPO: "o/r",
    GITHUB_TOKEN: "gh",
    RESEND_API_KEY: "re_test",
    RESEND_SEGMENT_ID: "seg_123",
    ARTIST_INBOX: "studio@example.com",
    ASSETS: {
      fetch: async () => Response.json({ paintings: catalog }),
    },
  });
  /** Stubs GitHub (the .md) and Resend (a two-person list, the send). */
  const stub = () => {
    const sent = [];
    const read = [];
    globalThis.fetch = async (url, init) => {
      const u = String(url);
      if (u.startsWith("https://api.github.com/")) {
        read.push(u);
        return new Response(md);
      }
      if (u.includes("/segments/"))
        return Response.json({
          data: [
            { id: "1", email: "a@resend.dev" },
            { id: "2", email: "b@resend.dev" },
          ],
        });
      sent.push(JSON.parse(init.body));
      return Response.json({ id: "b_1" });
    };
    return { sent, read };
  };
  const post = (e, body, auth = "Bearer admin") =>
    onRequestPost({
      request: new Request("https://barbart.ca/api/notify", {
        method: "POST",
        headers: { authorization: auth },
        body: JSON.stringify(body),
      }),
      env: e,
    });

  it("waits for the build when the page isn't live yet", async () => {
    const { sent, read } = stub();
    const res = await post(mailEnv([]), {
      email: true,
      file: "src/content/paintings/prairie-moon.md",
    });
    assert.deepEqual(await res.json(), {
      emailed: true,
      emailTotal: 2,
      scheduled: true,
      failed: false,
    });
    assert.match(read[0], /prairie-moon\.md/);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].scheduled_at, "in 10 min");
    assert.equal(sent[0].subject, "New painting: Prairie Moon");
    assert.match(sent[0].html, /api\/painting-image\?slug=prairie-moon/);
    assert.match(sent[0].html, /\$140 CAD/);
    assert.match(sent[0].text, /barbart\.ca\/paintings\/prairie-moon/);
  });

  it("sends at once when the page is already live", async () => {
    const { sent } = stub();
    const live = [
      {
        slug: "prairie-moon",
        title: "Prairie Moon",
        priceCents: 14000,
        sold: false,
        file: "src/content/paintings/prairie-moon.md",
        image: "/_astro/prairie-moon.abc.jpg",
      },
    ];
    // The nightly job names a slug, never a file.
    const res = await post(
      mailEnv(live),
      { email: true, slug: "prairie-moon", file: "src/content/x.md" },
      "Bearer nightly",
    );
    assert.equal((await res.json()).scheduled, false);
    assert.equal("scheduled_at" in sent[0], false);
    assert.equal(sent[0].subject, "New painting: Prairie Moon");
  });

  it("falls back to the plain note when the painting can't be read", async () => {
    const { sent } = stub();
    const res = await post(mailEnv([]), { email: true, slug: "missing" });
    assert.equal((await res.json()).emailed, true);
    assert.equal(sent[0].subject, "New painting at Barbara Straka's studio");
  });
});

describe("GET /api/notify", () => {
  it("previews the email from the draft words", async () => {
    const res = await onRequestGet({
      request: new Request(
        "https://barbart.ca/api/notify?subject=Open%20studio&body=Saturday",
        { headers: { authorization: "Bearer admin" } },
      ),
      env,
    });
    const data = await res.json();
    assert.equal(data.emailSubject, "Open studio");
    assert.match(data.emailText, /Saturday/);
    assert.equal("total" in data, false);
  });
});
