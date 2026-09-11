import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PUSH_COOLDOWN_MS,
  pushCooldownMs,
  readLastPushAt,
  readPushMessage,
  savePushMessage,
  stampPushAt,
} from "../../functions/_lib/push.ts";

/** Custom ping line + cooldown stamp round-trip through the one-row
 * table (no live D1). */

function stubDb() {
  const row = { body: null, title: null, pushed_at: "" };
  return {
    prepare: (sql) => ({
      bind: (...args) => ({
        run: async () => {
          if (String(sql).includes("pushed_at")) row.pushed_at = args[0];
          else if (args.length > 0) {
            row.body = args[0];
            row.title = args.length > 1 ? args[1] : "";
          }
          return {};
        },
        first: async () => {
          if (String(sql).includes("pushed_at"))
            return { pushed_at: row.pushed_at };
          if (row.body === null) return null;
          return { body: row.body, title: row.title };
        },
      }),
    }),
  };
}

describe("push message", () => {
  it("reads empty before anything is saved", async () => {
    assert.deepEqual(await readPushMessage({ DB: stubDb() }), {
      body: "",
      title: "",
    });
  });

  it("round-trips a saved line", async () => {
    const env = { DB: stubDb() };
    await savePushMessage(env, "New seascape just listed");
    assert.deepEqual(await readPushMessage(env), {
      body: "New seascape just listed",
      title: "",
    });
  });

  it("round-trips a custom title with the line", async () => {
    const env = { DB: stubDb() };
    await savePushMessage(env, "New seascape just listed", "Fresh today");
    assert.deepEqual(await readPushMessage(env), {
      body: "New seascape just listed",
      title: "Fresh today",
    });
  });

  it("blank overwrites back to the standard note", async () => {
    const env = { DB: stubDb() };
    await savePushMessage(env, "Something custom", "Something titled");
    await savePushMessage(env, "");
    assert.deepEqual(await readPushMessage(env), { body: "", title: "" });
  });

  it("reads a pre-title row as the standard title", async () => {
    // A row written before the title column existed reads back null.
    const env = {
      DB: {
        prepare: () => ({
          bind: () => ({
            run: async () => ({}),
            first: async () => ({ body: "Old line", title: null }),
          }),
        }),
      },
    };
    assert.deepEqual(await readPushMessage(env), {
      body: "Old line",
      title: "",
    });
  });
});

describe("push cooldown", () => {
  it("defaults to five minutes", () => {
    assert.equal(DEFAULT_PUSH_COOLDOWN_MS, 5 * 60 * 1000);
    assert.equal(pushCooldownMs({}), 5 * 60 * 1000);
  });

  it("takes PUSH_COOLDOWN_S seconds when set", () => {
    assert.equal(pushCooldownMs({ PUSH_COOLDOWN_S: "20" }), 20 * 1000);
  });

  it("ignores blank and garbage overrides", () => {
    assert.equal(pushCooldownMs({ PUSH_COOLDOWN_S: "" }), 5 * 60 * 1000);
    assert.equal(pushCooldownMs({ PUSH_COOLDOWN_S: "soon" }), 5 * 60 * 1000);
    assert.equal(pushCooldownMs({ PUSH_COOLDOWN_S: "-5" }), 5 * 60 * 1000);
  });

  it("reads zero before any ping", async () => {
    assert.equal(await readLastPushAt({ DB: stubDb() }), 0);
  });

  it("stamp then read lands within the cooldown", async () => {
    const env = { DB: stubDb() };
    await stampPushAt(env);
    const age = Date.now() - (await readLastPushAt(env));
    assert.ok(age >= 0 && age < DEFAULT_PUSH_COOLDOWN_MS);
  });

  it("stamping keeps the custom line", async () => {
    const env = { DB: stubDb() };
    await savePushMessage(env, "New seascape just listed", "Fresh today");
    await stampPushAt(env);
    assert.deepEqual(await readPushMessage(env), {
      body: "New seascape just listed",
      title: "Fresh today",
    });
  });
});
