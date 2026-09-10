import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mockConfirm,
  mockCount,
  mockList,
  mockSubscribe,
  mockUnsubscribe,
} from "../../functions/_lib/collectors-mock.ts";
import { onRequestGet, onRequestPost } from "../../functions/api/collectors.ts";

/** Dev mock list: localhost-only, D1-backed, no Resend involved. */

const FLAG = { COLLECTORS_MOCK: "true" };

function req(url, body) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function stubDb() {
  const rows = new Map();
  return {
    rows,
    prepare: (sql) => ({
      bind: (...args) => ({
        run: async () => {
          const text = String(sql);
          if (text.startsWith("INSERT")) {
            const [email, token, , created] = args;
            const prev = rows.get(email);
            rows.set(email, {
              token,
              confirmed_at: prev?.confirmed_at ?? null,
              created_at: prev?.created_at ?? created,
            });
          } else if (text.startsWith("UPDATE")) {
            const [at, email] = args;
            const prev = rows.get(email);
            if (prev !== undefined)
              rows.set(email, { ...prev, confirmed_at: at });
          } else if (text.startsWith("DELETE")) {
            rows.delete(args[0]);
          }
          return {};
        },
        first: async () => {
          const text = String(sql);
          if (text.includes("COUNT(*)"))
            return {
              total: [...rows.values()].filter((r) => r.confirmed_at).length,
            };
          const row = rows.get(args[0]);
          return row === undefined ? null : { ...row };
        },
      }),
    }),
  };
}

describe("mockList rail", () => {
  it("opens on localhost with the flag", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      assert.equal(
        mockList(FLAG, new Request(`http://${host}/api/collectors`)),
        true,
      );
    }
  });

  it("stays shut without the flag or off localhost", () => {
    assert.equal(
      mockList({}, new Request("http://127.0.0.1/api/collectors")),
      false,
    );
    assert.equal(
      mockList(FLAG, new Request("https://barbart.ca/api/collectors")),
      false,
    );
  });
});

describe("mock join-confirm-leave", () => {
  it("round-trips through the table", async () => {
    const env = { ...FLAG, DB: stubDb() };
    const first = await mockSubscribe(env, "fan@example.com");
    assert.equal(first?.already, false);
    assert.ok(first?.token);
    assert.equal(await mockCount(env), 0);
    assert.equal(await mockConfirm(env, "fan@example.com", first.token), true);
    assert.equal(await mockCount(env), 1);
    const again = await mockSubscribe(env, "fan@example.com");
    assert.equal(again?.already, true);
    await mockUnsubscribe(env, "fan@example.com");
    assert.equal(await mockCount(env), 0);
  });

  it("rejects a forged token", async () => {
    const env = { ...FLAG, DB: stubDb() };
    await mockSubscribe(env, "fan@example.com");
    assert.equal(await mockConfirm(env, "fan@example.com", "forged"), false);
  });
});

describe("mock endpoint", () => {
  it("joins with a confirm link and confirms it, no Resend", async () => {
    const db = stubDb();
    const env = { ...FLAG, DB: db };
    const join = await onRequestPost({
      request: req("http://127.0.0.1/api/collectors", {
        email: "fan@example.com",
      }),
      env,
    });
    assert.equal(join.status, 201);
    const data = await join.json();
    assert.equal(data.ok, true);
    const url = new URL(data.devConfirmUrl);
    assert.ok(url.hostname === "127.0.0.1" || url.hostname === "localhost");
    const confirm = await onRequestPost({
      request: req("http://127.0.0.1/api/collectors", {
        action: "confirm",
        email: url.searchParams.get("email"),
        token: url.searchParams.get("token"),
      }),
      env,
    });
    assert.equal(confirm.status, 200);
    const count = await onRequestGet({
      request: new Request("http://127.0.0.1/api/collectors"),
      env,
    });
    assert.deepEqual(await count.json(), { total: 1 });
    const leave = await onRequestPost({
      request: req("http://127.0.0.1/api/collectors", {
        action: "unsubscribe",
        email: "fan@example.com",
      }),
      env,
    });
    assert.equal(leave.status, 200);
    assert.equal(db.rows.size, 0);
  });

  it("refuses the mock off localhost even with the flag", async () => {
    const res = await onRequestPost({
      request: req("https://barbart.ca/api/collectors", {
        email: "fan@example.com",
      }),
      env: { ...FLAG, DB: stubDb() },
    });
    assert.equal(res.status, 500);
  });
});
