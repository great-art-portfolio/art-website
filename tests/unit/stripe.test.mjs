import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  checkoutParams,
  findSellable,
  isPaidSale,
  saleEmail,
  verifyStripeSignature,
} from "../../functions/_lib/stripe.ts";
import {
  parseCatalog,
  parseStripeEvent,
} from "../../functions/_lib/validation.ts";
import { onRequestPost as webhook } from "../../functions/api/stripe-webhook.ts";
import { onRequestPost as checkout } from "../../functions/api/checkout.ts";
import { markSold } from "../../src/lib/painting-edit.ts";

const item = {
  slug: "night-reeds",
  title: "Night Reeds",
  priceCents: 14000,
  sold: false,
  file: "src/content/paintings/2122x2118.md",
};
const catalog = [item, { ...item, slug: "gone", title: "Gone", sold: true }];

describe("findSellable", () => {
  it("accepts the built title and price", () => {
    const r = findSellable(catalog, {
      slug: "night-reeds",
      title: "Night Reeds",
      priceCents: 14000,
    });
    assert.equal(r.ok, true);
  });
  it("refuses a price the build doesn't have", () => {
    const r = findSellable(catalog, {
      slug: "night-reeds",
      title: "Night Reeds",
      priceCents: 100,
    });
    assert.deepEqual([r.ok, r.ok ? 0 : r.status], [false, 409]);
  });
  it("refuses sold and unknown paintings", () => {
    const sold = findSellable(catalog, {
      slug: "gone",
      title: "Gone",
      priceCents: 14000,
    });
    const unknown = findSellable(catalog, {
      slug: "x",
      title: "X",
      priceCents: 1,
    });
    assert.equal(sold.ok ? 0 : sold.status, 409);
    assert.equal(unknown.ok ? 0 : unknown.status, 404);
  });
  it("drops malformed catalog rows", () => {
    const rows = parseCatalog({
      paintings: [item, { slug: "bad", priceCents: -1 }],
    });
    assert.equal(rows.length, 1);
  });
});

describe("checkoutParams", () => {
  it("charges the built price in CAD and ships to Canada and the US", () => {
    const p = checkoutParams(item, "https://barbart.ca", {
      tax: false,
      nowSec: 1000,
    });
    assert.equal(p.get("line_items[0][price_data][unit_amount]"), "14000");
    assert.equal(p.get("line_items[0][price_data][currency]"), "cad");
    assert.equal(p.get("metadata[painting_file]"), item.file);
    assert.equal(
      p.get("shipping_address_collection[allowed_countries][0]"),
      "CA",
    );
    assert.equal(
      p.get("shipping_address_collection[allowed_countries][1]"),
      "US",
    );
    assert.equal(p.get("expires_at"), String(1000 + 30 * 60));
    assert.equal(
      p.get("success_url"),
      "https://barbart.ca/thanks?painting=night-reeds",
    );
    assert.equal(
      p.get("cancel_url"),
      "https://barbart.ca/paintings/night-reeds",
    );
    assert.equal(p.get("automatic_tax[enabled]"), null);
    assert.equal(p.get("payment_method_types[0]"), null);
  });
  it("adds Stripe Tax on top of the price when switched on", () => {
    const p = checkoutParams(item, "https://barbart.ca", {
      tax: true,
      nowSec: 0,
    });
    assert.equal(p.get("automatic_tax[enabled]"), "true");
    assert.equal(p.get("line_items[0][price_data][tax_behavior]"), "exclusive");
    assert.equal(
      p.get("line_items[0][price_data][product_data][tax_code]"),
      "txcd_99999999",
    );
  });
});

function sign(payload, secret, t) {
  const v1 = createHmac("sha256", secret)
    .update(`${t}.${payload}`)
    .digest("hex");
  return `t=${t},v1=${v1}`;
}

describe("verifyStripeSignature", () => {
  const secret = "whsec_test";
  it("accepts Stripe's signature", async () => {
    const header = sign("{}", secret, 5000);
    assert.equal(await verifyStripeSignature("{}", header, secret, 5000), true);
  });
  it("rejects a tampered body, a wrong secret, and an old timestamp", async () => {
    const header = sign("{}", secret, 5000);
    assert.equal(
      await verifyStripeSignature("{ }", header, secret, 5000),
      false,
    );
    assert.equal(
      await verifyStripeSignature("{}", header, "whsec_other", 5000),
      false,
    );
    assert.equal(
      await verifyStripeSignature("{}", header, secret, 5000 + 301),
      false,
    );
    assert.equal(await verifyStripeSignature("{}", null, secret, 5000), false);
  });
});

const md = `---\ntitle: "Night Reeds"\nprice: 140\nsold: false\n---\nReeds at dusk.\n`;

describe("markSold", () => {
  it("flips sold and keeps the rest", () => {
    assert.equal(markSold(md), md.replace("sold: false", "sold: true"));
  });
});

function paidEvent(overrides = {}) {
  return {
    id: "evt_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        payment_status: "paid",
        amount_total: 14700,
        currency: "cad",
        livemode: false,
        metadata: {
          painting_slug: item.slug,
          painting_title: item.title,
          painting_file: item.file,
        },
        total_details: { amount_tax: 700 },
        customer_details: {
          name: "Ada Buyer",
          email: "ada@resend.dev",
          phone: "+14035550100",
          address: null,
        },
        collected_information: {
          shipping_details: {
            name: "Ada Buyer",
            address: {
              line1: "1 Main St",
              line2: null,
              city: "Calgary",
              state: "AB",
              postal_code: "T2P 1J9",
              country: "CA",
            },
          },
        },
        ...overrides,
      },
    },
  };
}

describe("sale events", () => {
  it("counts paid checkouts and async successes only", () => {
    assert.equal(isPaidSale(parseStripeEvent(paidEvent())), true);
    assert.equal(
      isPaidSale(parseStripeEvent(paidEvent({ payment_status: "unpaid" }))),
      false,
    );
    const asyncOk = {
      ...paidEvent({ payment_status: "unpaid" }),
      type: "checkout.session.async_payment_succeeded",
    };
    assert.equal(isPaidSale(parseStripeEvent(asyncOk)), true);
  });
  it("emails who bought what and where to ship it", () => {
    const { subject, text } = saleEmail(parseStripeEvent(paidEvent()), {
      alreadySold: false,
    });
    assert.equal(subject, 'Sold: "Night Reeds"');
    assert.match(text, /Ada Buyer \(ada@resend\.dev\) bought "Night Reeds"/);
    assert.match(text, /Paid: \$147\.00 CAD \(includes \$7\.00 CAD tax\)/);
    assert.match(text, /1 Main St\nCalgary AB T2P 1J9\nCA/);
    assert.match(text, /test mode/);
  });
  it("warns when the painting was already sold", () => {
    const { subject, text } = saleEmail(parseStripeEvent(paidEvent()), {
      alreadySold: true,
    });
    assert.equal(subject, 'Check this sale: "Night Reeds"');
    assert.match(text, /refund this buyer/);
  });
});

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** GitHub + Resend stub. Records commits and emails. */
function stubServices(fileMd) {
  const calls = { trees: [], emails: [] };
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const body = init.body ? JSON.parse(init.body) : null;
    const ok = (data) => ({
      ok: true,
      status: 200,
      json: async () => data,
      text: async () => "",
    });
    if (u.includes("/contents/"))
      return ok({
        content: Buffer.from(fileMd).toString("base64"),
        encoding: "base64",
      });
    if (u.includes("/git/ref/heads/")) return ok({ object: { sha: "base" } });
    if (u.includes("/git/commits/base")) return ok({ tree: { sha: "tree0" } });
    if (u.endsWith("/git/trees")) {
      calls.trees.push(body);
      return ok({ sha: "tree1" });
    }
    if (u.endsWith("/git/commits")) {
      calls.commitMessage = body.message;
      return ok({ sha: "c1" });
    }
    if (u.includes("/git/refs/heads/")) return ok({});
    if (u === "https://api.resend.com/emails") {
      calls.emails.push(body);
      return ok({ id: "e1" });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  return calls;
}

const env = {
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  GITHUB_TOKEN: "t",
  GITHUB_REPO: "o/r",
  GITHUB_BRANCH: "main",
  RESEND_API_KEY: "re_x",
  ARTIST_INBOX: "artist@resend.dev",
};

function webhookRequest(event, secret = "whsec_test") {
  const payload = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  return new Request("https://barbart.ca/api/stripe-webhook", {
    method: "POST",
    headers: { "stripe-signature": sign(payload, secret, t) },
    body: payload,
  });
}

describe("POST /api/stripe-webhook", () => {
  it("commits sold: true and emails the artist", async () => {
    const calls = stubServices(md);
    const res = await webhook({ request: webhookRequest(paidEvent()), env });
    assert.equal(res.status, 200);
    assert.equal(calls.commitMessage, "Sold online: Night Reeds");
    const written = Buffer.from(
      calls.trees[0].tree[0].content,
      "base64",
    ).toString();
    assert.match(written, /^sold: true$/m);
    assert.equal(calls.trees[0].tree[0].path, item.file);
    assert.equal(calls.emails[0].to[0], "artist@resend.dev");
    assert.equal(calls.emails[0].reply_to, "ada@resend.dev");
  });
  it("doesn't commit twice, and flags the double sale", async () => {
    const calls = stubServices(markSold(md));
    const res = await webhook({ request: webhookRequest(paidEvent()), env });
    assert.deepEqual(await res.json(), { ok: true, alreadySold: true });
    assert.equal(calls.trees.length, 0);
    assert.match(calls.emails[0].subject, /^Check this sale/);
  });
  it("rejects unsigned requests", async () => {
    const calls = stubServices(md);
    const res = await webhook({
      request: webhookRequest(paidEvent(), "whsec_wrong"),
      env,
    });
    assert.equal(res.status, 400);
    assert.equal(calls.trees.length, 0);
  });
  it("ignores unpaid sessions", async () => {
    const calls = stubServices(md);
    const res = await webhook({
      request: webhookRequest(paidEvent({ payment_status: "unpaid" })),
      env,
    });
    assert.deepEqual(await res.json(), { ignored: true });
    assert.equal(calls.trees.length, 0);
  });
});

describe("POST /api/checkout", () => {
  const assets = {
    fetch: async () => new Response(JSON.stringify({ paintings: catalog })),
  };
  const post = (body, extra = {}) =>
    checkout({
      request: new Request("https://barbart.ca/api/checkout", {
        method: "POST",
        body: JSON.stringify(body),
      }),
      env: {
        ENABLE_STRIPE: "true",
        STRIPE_SECRET_KEY: "sk_test_x",
        ASSETS: assets,
        ...extra,
      },
    });

  it("is off until Stripe is switched on", async () => {
    const res = await checkout({
      request: new Request("https://barbart.ca/api/checkout", {
        method: "POST",
        body: "{}",
      }),
      env: { ASSETS: assets },
    });
    assert.equal(res.status, 501);
  });
  it("sends the built price to Stripe and returns its page", async () => {
    let sent = null;
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), "https://api.stripe.com/v1/checkout/sessions");
      sent = new URLSearchParams(init.body);
      return new Response(
        JSON.stringify({ url: "https://checkout.stripe.com/c/pay/x" }),
      );
    };
    const res = await post({
      slug: "night-reeds",
      title: "Night Reeds",
      priceCents: 14000,
    });
    assert.deepEqual(await res.json(), {
      url: "https://checkout.stripe.com/c/pay/x",
    });
    assert.equal(sent.get("line_items[0][price_data][unit_amount]"), "14000");
  });
  it("refuses a browser-made price before calling Stripe", async () => {
    globalThis.fetch = async () => {
      throw new Error("Stripe must not be called");
    };
    const res = await post({
      slug: "night-reeds",
      title: "Night Reeds",
      priceCents: 1,
    });
    assert.equal(res.status, 409);
  });
  it("refuses a painting git already marks sold", async () => {
    stubServices(markSold(md));
    const res = await post(
      { slug: "night-reeds", title: "Night Reeds", priceCents: 14000 },
      { GITHUB_TOKEN: "t", GITHUB_REPO: "o/r" },
    );
    assert.equal(res.status, 409);
  });
});
