import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TICKLE_BATCH,
  countSubscriptions,
  listSubscriptions,
} from "../../functions/_lib/push.ts";

/** Batched ping pages through the whole subscription list (one Worker
 * call only carries ~50 subrequests, so big lists go out in batches). */

function stubDb(subs) {
  const slice = (limit, offset) => {
    const from = offset ?? 0;
    const to = limit === undefined ? subs.length : from + limit;
    return { results: subs.slice(from, to) };
  };
  return {
    prepare: (sql) => ({
      all: async () => slice(undefined, 0),
      bind: (...args) => ({
        run: async () => ({}),
        first: async () => {
          if (String(sql).includes("COUNT")) return { total: subs.length };
          return null;
        },
        all: async () => {
          if (String(sql).includes("COUNT"))
            return { results: [{ total: subs.length }] };
          return slice(args[0], args[1]);
        },
      }),
    }),
  };
}

const subs = Array.from({ length: 65 }, (_, i) => ({
  endpoint: `https://push.example.com/sub/${i}`,
  p256dh: "p256dh",
  auth: "auth",
}));

describe("push subscriber paging", () => {
  it("counts the whole list", async () => {
    assert.equal(await countSubscriptions({ DB: stubDb(subs) }), 65);
  });

  it("slices the list into batches", async () => {
    const env = { DB: stubDb(subs) };
    assert.equal(TICKLE_BATCH <= 50, true);
    const first = await listSubscriptions(env, TICKLE_BATCH, 0);
    assert.equal(first.length, TICKLE_BATCH);
    assert.equal(first[0].endpoint, "https://push.example.com/sub/0");
    const second = await listSubscriptions(env, TICKLE_BATCH, TICKLE_BATCH);
    assert.equal(second.length, 65 - TICKLE_BATCH);
    assert.equal(
      second[second.length - 1].endpoint,
      "https://push.example.com/sub/64",
    );
    assert.deepEqual(await listSubscriptions(env, TICKLE_BATCH, 65), []);
  });

  it("lists everything when unpaged", async () => {
    assert.equal((await listSubscriptions({ DB: stubDb(subs) })).length, 65);
  });
});
