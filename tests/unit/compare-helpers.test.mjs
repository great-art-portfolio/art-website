import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  main,
  pickPaintings,
  readPaintings,
  sheetHtml,
} from "../../scripts/compare-helpers.mjs";

/** The helper comparison with both APIs stubbed and the keychain and the
 * renderer swapped out: no real call, no real key. Her paintings are the
 * fixtures, never the live collection. */

const DIR = fileURLToPath(
  new URL("../fixtures/site/content/paintings", import.meta.url),
);
const FAKE = {
  deepseek: "sk-test-fake-deepseek",
  gemini: "AQ.test-fake-gemini",
};
const realFetch = globalThis.fetch;
const realLog = console.log;
afterEach(() => {
  globalThis.fetch = realFetch;
  console.log = realLog;
});

const ideas = (who) => ({
  titles: [`${who} One`, `${who} Two`, `${who} Three`],
  description: `${who} sees blue curves & <pale> shapes.`,
  alt: `${who} alt text.`,
});

/** Stubs both APIs; records what each was sent. */
function stubApis({ geminiStatus = 200 } = {}) {
  const sent = { deepseek: [], gemini: [] };
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(String(init.body));
    if (String(url).startsWith("https://api.deepseek.com/")) {
      sent.deepseek.push({ init, body });
      return Response.json({
        choices: [{ message: { content: JSON.stringify(ideas("DS")) } }],
      });
    }
    if (String(url).includes("gemini-4-hydrogen:generateContent")) {
      sent.gemini.push({ init, body });
      if (geminiStatus !== 200)
        return Response.json(
          { error: { code: geminiStatus, status: "RESOURCE_EXHAUSTED" } },
          { status: geminiStatus },
        );
      return Response.json({
        candidates: [
          { content: { parts: [{ text: JSON.stringify(ideas("GH")) }] } },
        ],
      });
    }
    throw new Error(`unexpected call to ${url}`);
  };
  return sent;
}

async function runMocked(opts) {
  const sent = stubApis(opts);
  const lines = [];
  console.log = (...a) => lines.push(a.join(" "));
  let rendered;
  const result = await main(["--out", "/tmp/never-written.jpg"], {
    dir: DIR,
    key: async (account) => FAKE[account],
    render: async (html, out) => {
      rendered = { html, out };
    },
  });
  return { ...result, sent, lines, rendered };
}

describe("pickPaintings", () => {
  it("takes three that differ, saying why, and skips trashed ones", async () => {
    const all = await readPaintings(DIR);
    assert.ok(!all.some((p) => p.trash), "trashed paintings are left out");
    const picks = pickPaintings(all);
    assert.equal(picks.length, 3);
    assert.equal(new Set(picks.map((p) => p.stem)).size, 3);
    const landscape = picks.find((p) => p.why === "landscape-like");
    assert.equal(landscape?.title, "Prairie Moon");
    assert.ok(picks.some((p) => p.why === "abstract"));
  });
});

describe("compare-helpers", () => {
  it("asks both models the helper's real prompt for each painting and puts both on one sheet", async () => {
    const { rows, sent, rendered, lines } = await runMocked();
    assert.equal(rows.length, 3);
    assert.equal(sent.deepseek.length, 3);
    assert.equal(sent.gemini.length, 3);

    // DeepSeek as the helper asked it: the photo as image_url, thinking off.
    const ds = sent.deepseek[0];
    assert.equal(ds.init.headers.Authorization, `Bearer ${FAKE.deepseek}`);
    assert.equal(ds.body.model, "deepseek-flash");
    assert.deepEqual(ds.body.thinking, { type: "disabled" });
    assert.match(ds.body.messages[0].content, /Barbara Straka/);
    assert.match(
      ds.body.messages[1].content[1].image_url.url,
      /^data:image\/jpeg;base64,/,
    );
    // Hydrogen: the same prompt and photo, inline, low thinking.
    const gh = sent.gemini[0];
    assert.equal(gh.init.headers["x-goog-api-key"], FAKE.gemini);
    assert.equal(
      gh.body.systemInstruction.parts[0].text,
      ds.body.messages[0].content,
    );
    assert.equal(
      gh.body.contents[0].parts[0].text,
      ds.body.messages[1].content[0].text,
    );
    assert.equal(
      `data:image/jpeg;base64,${gh.body.contents[0].parts[1].inlineData.data}`,
      ds.body.messages[1].content[1].image_url.url,
    );
    assert.deepEqual(gh.body.generationConfig.thinkingConfig, {
      thinkingLevel: "low",
    });

    // Shown as the studio shows a new painting: no title, a photo at most
    // 1024 px, and not its own words among the examples.
    for (const [i, row] of rows.entries()) {
      const user = sent.deepseek[i].body.messages[1].content[0].text;
      assert.doesNotMatch(user, /Working title/);
      const system = sent.deepseek[i].body.messages[0].content;
      assert.ok(
        !system.includes(`“${row.painting.title}”:`),
        `${row.painting.title}'s own description isn't an example`,
      );
    }

    // One sheet, both models labelled, her title for reference, escaped.
    const html = rendered.html;
    assert.equal(rendered.out, "/tmp/never-written.jpg");
    assert.equal((html.match(/<section>/g) ?? []).length, 3);
    assert.equal(
      (html.match(/<h3>DeepSeek<small>deepseek-flash/g) ?? []).length,
      3,
    );
    assert.equal(
      (html.match(/<h3>Gemini 4 Hydrogen<small>gemini-4-hydrogen/g) ?? [])
        .length,
      3,
    );
    assert.match(html, /<li>DS One<\/li>/);
    assert.match(html, /<li>GH Three<\/li>/);
    assert.match(html, /GH sees blue curves &amp; &lt;pale&gt; shapes\./);
    assert.match(html, /Her title: <b>Prairie Moon<\/b>/);
    assert.match(
      lines.join("\n"),
      /Prairie Moon · Gemini 4 Hydrogen: GH One \/ GH Two \/ GH Three/,
    );

    // The keys stay out of everything shown.
    for (const k of Object.values(FAKE)) {
      assert.ok(!html.includes(k));
      assert.ok(!lines.join("\n").includes(k));
    }
  });

  it("shows Google's free limit on the sheet instead of stopping, and asks no other model", async () => {
    const { rows, sent, rendered } = await runMocked({ geminiStatus: 429 });
    assert.equal(sent.gemini.length, 3);
    assert.equal(sent.deepseek.length, 3);
    assert.match(
      rows[0].answers.gemini.error,
      /^Google's free limit is used up for now — try again later\. \(Google's free limit is used up \(429\)/,
    );
    assert.match(
      rendered.html,
      /class="err">Google&#39;s|class="err">Google's free limit/,
    );
    assert.match(rendered.html, /<li>DS One<\/li>/);
  });

  it("names the missing key and how to add it", async () => {
    await assert.rejects(
      main([], {
        dir: DIR,
        key: async (account) => {
          throw new Error(
            `No ${account} key in z's keychain: copy it and run keys key add ${account} (ccez-keys).`,
          );
        },
        render: async () => {},
      }),
      /No deepseek key in z's keychain: copy it and run keys key add deepseek/,
    );
  });

  it("escapes what the models say", () => {
    const html = sheetHtml([
      {
        painting: {
          title: "<b>x</b>",
          why: "abstract",
          widthIn: "",
          heightIn: "",
        },
        image: "data:image/jpeg;base64,AAAA",
        answers: {
          deepseek: { error: "<script>alert(1)</script>" },
          gemini: {
            ideas: { titles: ["<i>t</i>"], description: "d", alt: "" },
            seconds: 2,
          },
        },
      },
    ]);
    assert.ok(!html.includes("<script>alert"));
    assert.ok(!html.includes("<i>t</i>"));
    assert.match(html, /\(none\)/);
  });
});
