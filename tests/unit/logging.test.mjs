import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { logEvent, logRow } from "../../functions/_lib/log.ts";
import { onRequestPost as postInquiry } from "../../functions/api/inquiries.ts";
import { onRequestPost as postLog } from "../../functions/api/log.ts";
import { onRequest as middleware } from "../../functions/api/_middleware.ts";
import { buildQuery, sinceModifier } from "../../scripts/logs.mjs";

/** A D1 stand-in that records every statement and its values. */
function fakeDb({ count = 0, failInsert = false } = {}) {
  const runs = [];
  let nextId = 1;
  const db = {
    runs,
    prepare(sql) {
      let values = [];
      const stmt = {
        bind(...v) {
          values = v;
          return stmt;
        },
        async run() {
          if (failInsert && sql.startsWith("INSERT INTO inquiries"))
            throw new Error("D1 down");
          runs.push({ sql, values });
          return { success: true };
        },
        async first() {
          if (failInsert && sql.startsWith("INSERT INTO inquiries"))
            throw new Error("D1 down");
          runs.push({ sql, values });
          if (sql.startsWith("SELECT COUNT")) return { n: count };
          return { id: nextId++ };
        },
      };
      return stmt;
    },
  };
  return db;
}

const logs = (db) =>
  db.runs
    .filter((r) => r.sql.startsWith("INSERT INTO logs"))
    .map((r) => ({
      level: r.values[0],
      source: r.values[1],
      event: r.values[2],
      detail: JSON.parse(r.values[6]),
    }));

const catalog = [
  {
    slug: "night-reeds",
    title: "Night Reeds",
    file: "src/content/paintings/2122x2118.md",
    priceCents: 14000,
    sold: false,
    aliases: [],
  },
];

const assets = {
  fetch: async () => Response.json({ paintings: catalog }),
};

const quiet = console.error;
afterEach(() => {
  console.error = quiet;
});

describe("logRow", () => {
  it("keeps the route, ray and a short stack, and never the whole body", () => {
    const request = new Request("https://barbart.ca/api/inquiries", {
      method: "POST",
      headers: { "cf-ray": "abc123" },
    });
    const row = logRow({
      event: "inquiry.x",
      message: "m",
      err: new Error("boom"),
      request,
    });
    assert.equal(row.route, "POST /api/inquiries");
    assert.equal(row.ray, "abc123");
    assert.equal(row.level, "error");
    assert.equal(JSON.parse(row.detail).error, "boom");
  });

  it("truncates huge detail", () => {
    const row = logRow({
      event: "e",
      message: "m",
      detail: { big: "x".repeat(10_000) },
    });
    assert.ok(row.detail.length < 4200);
  });
});

describe("logEvent", () => {
  it("never throws, even when D1 does", async () => {
    console.error = () => {};
    const broken = {
      prepare() {
        throw new Error("no D1");
      },
    };
    await logEvent({ DB: broken }, { event: "e", message: "m" });
  });
});

describe("inquiries are kept even when the email fails", () => {
  it("records the inquiry, marks it failed, and logs why", async () => {
    console.error = () => {};
    const db = fakeDb();
    const res = await postInquiry({
      env: { DB: db, ASSETS: assets },
      request: new Request("http://localhost/api/inquiries", {
        method: "POST",
        body: JSON.stringify({
          name: "Ana",
          email: "ana@resend.dev",
          slug: "night-reeds",
          message: "Hi",
        }),
      }),
    });
    // No mail configured: a 5xx, so the page's outbox retries.
    assert.equal(res.status, 500);
    const insert = db.runs.find((r) =>
      r.sql.startsWith("INSERT INTO inquiries"),
    );
    assert.deepEqual(insert.values.slice(0, 4), [
      "night-reeds",
      "Night Reeds",
      "Ana",
      "ana@resend.dev",
    ]);
    const update = db.runs.find((r) => r.sql.startsWith("UPDATE inquiries"));
    assert.equal(update.values[0], "failed");
    assert.deepEqual(
      logs(db).map((l) => l.event),
      ["inquiry.not_delivered"],
    );
  });

  it("still tries to send when the record can't be saved", async () => {
    console.error = () => {};
    const db = fakeDb({ failInsert: true });
    const res = await postInquiry({
      env: { DB: db, ASSETS: assets },
      request: new Request("http://localhost/api/inquiries", {
        method: "POST",
        body: JSON.stringify({
          name: "Ana",
          email: "ana@resend.dev",
          slug: "night-reeds",
        }),
      }),
    });
    assert.equal(res.status, 500);
    assert.deepEqual(
      logs(db).map((l) => l.event),
      ["inquiry.record_failed", "inquiry.not_delivered"],
    );
  });
});

describe("POST /api/log", () => {
  const post = (db, body, headers = { "sec-fetch-site": "same-origin" }) =>
    postLog({
      env: { DB: db },
      request: new Request("https://barbart.ca/api/log", {
        method: "POST",
        headers,
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    });

  it("keeps a page's report under client.*", async () => {
    console.error = () => {};
    const db = fakeDb();
    const res = await post(db, {
      event: "uncaught",
      message: "x is undefined",
      page: "/admin",
      level: "warn",
    });
    assert.equal(res.status, 204);
    const [row] = logs(db);
    assert.equal(row.event, "client.uncaught");
    assert.equal(row.source, "client");
    assert.equal(row.level, "warn");
    const raw = db.runs.find((r) => r.sql.startsWith("INSERT INTO logs"));
    assert.equal(raw.values[4], "page /admin");
  });

  it("can't pose as a server event", async () => {
    console.error = () => {};
    const db = fakeDb();
    await post(db, { event: "sale.mark_failed'; DROP", message: "m" });
    assert.equal(logs(db)[0].event, "client.sale.mark_failedDROP");
  });

  it("refuses other sites and oversized bodies", async () => {
    const db = fakeDb();
    assert.equal(
      (await post(db, { event: "e" }, { "sec-fetch-site": "cross-site" }))
        .status,
      403,
    );
    assert.equal((await post(db, "x".repeat(7000))).status, 400);
    assert.equal(logs(db).length, 0);
  });

  it("stops keeping reports past the ten-minute limit", async () => {
    const db = fakeDb({ count: 100 });
    assert.equal((await post(db, { event: "e", message: "m" })).status, 204);
    assert.equal(logs(db).length, 0);
  });
});

describe("API middleware", () => {
  const ctx = (db, next) => {
    const waits = [];
    return {
      waits,
      env: { DB: db },
      request: new Request("https://barbart.ca/api/checkout", {
        method: "POST",
      }),
      next,
      waitUntil: (p) => waits.push(p),
    };
  };

  it("turns a throw into a plain 500 and logs it", async () => {
    console.error = () => {};
    const db = fakeDb();
    const c = ctx(db, async () => {
      throw new Error("kaboom");
    });
    const res = await middleware(c);
    await Promise.all(c.waits);
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: "Something went wrong" });
    assert.deepEqual(
      logs(db).map((l) => l.event),
      ["http.uncaught", "http.5xx"],
    );
  });

  it("logs a 5xx answer but not a switched-off feature", async () => {
    console.error = () => {};
    const db = fakeDb();
    const c = ctx(db, async () =>
      Response.json({ error: "x" }, { status: 503 }),
    );
    await middleware(c);
    const off = ctx(db, async () =>
      Response.json({ error: "off" }, { status: 501 }),
    );
    await middleware(off);
    await Promise.all([...c.waits, ...off.waits]);
    assert.deepEqual(
      logs(db).map((l) => l.detail.status),
      [503],
    );
  });
});

describe("pnpm logs", () => {
  it("reads a window and checks every value it puts in SQL", () => {
    assert.equal(sinceModifier("2h"), "-2 hours");
    assert.throws(() => sinceModifier("2 weeks"));
    const sql = buildQuery({
      since: "1d",
      limit: "20",
      level: "",
      source: "",
      event: "sale",
      inquiries: false,
    });
    assert.match(sql, /event LIKE 'sale%'/);
    assert.match(sql, /level IN \('error', 'warn'\)/);
    assert.throws(() =>
      buildQuery({
        since: "1d",
        limit: "5",
        level: "",
        source: "",
        event: "x' OR 1",
        inquiries: false,
      }),
    );
    assert.match(
      buildQuery({ since: "7d", limit: "5", inquiries: true, failed: true }),
      /FROM inquiries .*status != 'sent'/,
    );
  });
});
