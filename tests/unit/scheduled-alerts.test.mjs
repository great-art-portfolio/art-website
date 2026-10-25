import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildMarkdown,
  parsePainting,
  patchPainting,
  publishDue,
} from "../../src/lib/painting-edit.ts";
import { onRequestPost as notifyPost } from "../../functions/api/notify.ts";
import {
  sendAlerts,
  waitForPage,
} from "../../scripts/send-scheduled-alerts.mjs";

/** Alerts ticked on a scheduled painting: remembered in its file, sent on
 * its day by whichever publishes it, then dropped. */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const base = {
  title: "Thaw",
  price: 100,
  alt: "",
  description: "Words.",
  imageFile: "thaw.jpg",
  widthIn: 12,
  heightIn: 12,
  depthIn: null,
  medium: "",
  draft: true,
  modelGlb: "",
  modelUsdz: "",
};

describe("alerts in the painting file", () => {
  it("remembers ticked alerts only with a scheduled date", () => {
    const scheduled = buildMarkdown({
      ...base,
      publishOn: "2026-11-01",
      alertOnPublish: "push,email",
    });
    assert.match(scheduled, /^alertOnPublish: "push,email"$/m);
    assert.equal(parsePainting(scheduled)?.alertOnPublish, "push,email");
    const noDate = buildMarkdown({
      ...base,
      publishOn: "",
      alertOnPublish: "email",
    });
    assert.doesNotMatch(noDate, /alertOnPublish/);
  });

  it("follows edits, and clears with the schedule", () => {
    const md = buildMarkdown({ ...base, publishOn: "2026-11-01" });
    const edits = {
      title: "Thaw",
      price: "100.00",
      alt: "",
      description: "Words.",
      widthIn: "12",
      heightIn: "12",
      depthIn: "",
      medium: "",
      draft: true,
      sold: false,
    };
    const ticked = patchPainting(md, { ...edits, alertOnPublish: "email" });
    assert.equal(parsePainting(ticked)?.alertOnPublish, "email");
    const unticked = patchPainting(ticked, { ...edits, alertOnPublish: "" });
    assert.equal(parsePainting(unticked)?.alertOnPublish, "");
    const unscheduled = patchPainting(ticked, { ...edits, publishOn: "" });
    assert.doesNotMatch(unscheduled, /alertOnPublish/);
    assert.doesNotMatch(publishDue(ticked), /alertOnPublish/);
  });
});

describe("the workflow's alerts key", () => {
  const env = { ALERTS_TOKEN: "nightly", ADMIN_API_TOKEN: "admin" };
  const call = (body, token = "nightly") =>
    notifyPost({
      request: new Request("https://barbart.ca/api/notify", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }),
      env,
    });

  it("sends the standard publish alert", async () => {
    // No DB or mail configured: the call gets past auth and reports zeros.
    const res = await call({ push: false, email: true });
    assert.equal(res.status, 200);
  });

  it("can't send custom text or a Ping", async () => {
    assert.equal((await call({ push: { body: "hi" } })).status, 403);
    assert.equal(
      (await call({ push: false, email: { subject: "x" } })).status,
      403,
    );
  });

  it("is refused when it doesn't match", async () => {
    assert.equal((await call({ push: true }, "guess")).status, 401);
  });
});

describe("send-scheduled-alerts", () => {
  it("waits for the page, then gives up after its window", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response("", { status: calls < 3 ? 404 : 200 });
    };
    assert.equal(await waitForPage("https://x/p", 1000, 1), true);
    globalThis.fetch = async () => new Response("", { status: 404 });
    assert.equal(await waitForPage("https://x/p", 5, 1), false);
  });

  it("pages the push list and sends the email once", async () => {
    const bodies = [];
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), "https://barbart.ca/api/notify");
      assert.equal(init.headers.Authorization, "Bearer nightly");
      const body = JSON.parse(init.body);
      bodies.push(body);
      return Response.json(
        bodies.length === 1
          ? { sent: 40, total: 55, nextCursor: 40, emailTotal: 12 }
          : { sent: 15, total: 55, nextCursor: null },
      );
    };
    const r = await sendAlerts("https://barbart.ca", "nightly", {
      push: true,
      email: true,
    });
    assert.deepEqual(r, { pushed: 55, total: 55, emailed: 12 });
    assert.deepEqual(bodies, [
      { push: true, email: true },
      { push: true, email: false, cursor: 40 },
    ]);
  });

  it("fails loudly when the site refuses", async () => {
    globalThis.fetch = async () => new Response("no", { status: 401 });
    await assert.rejects(
      sendAlerts("https://barbart.ca", "nightly", { push: true, email: false }),
      /401/,
    );
  });
});
