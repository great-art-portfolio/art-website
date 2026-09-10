import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readPushMessage, savePushMessage } from "../../functions/_lib/push.ts";

/** Custom ping line round-trips through the one-row table (no live D1). */

function stubDb() {
  let body = null;
  return {
    prepare: () => ({
      bind: (...args) => ({
        run: async () => {
          if (args.length > 0) body = args[0];
          return {};
        },
        first: async () => (body === null ? null : { body }),
      }),
    }),
  };
}

describe("push message", () => {
  it("reads empty before anything is saved", async () => {
    assert.equal(await readPushMessage({ DB: stubDb() }), "");
  });

  it("round-trips a saved line", async () => {
    const env = { DB: stubDb() };
    await savePushMessage(env, "New seascape just listed");
    assert.equal(await readPushMessage(env), "New seascape just listed");
  });

  it("blank overwrites back to the standard note", async () => {
    const env = { DB: stubDb() };
    await savePushMessage(env, "Something custom");
    await savePushMessage(env, "");
    assert.equal(await readPushMessage(env), "");
  });
});
