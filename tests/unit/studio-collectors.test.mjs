import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectorsEnv,
  createCollectorsDb,
  readDevVars,
} from "../../scripts/studio-collectors.mjs";
import {
  mockConfirm,
  mockCount,
  mockSubscribe,
  mockUnsubscribe,
} from "../../functions/_lib/collectors-mock.ts";

/** Sidecar collectors adapter: .dev.vars parsing, the file-backed mock
 * table, and the handler env. The table runs the real mock helpers —
 * the sidecar answers with the real endpoint, not a copy of it. */

function tmpRoot(vars) {
  const root = mkdtempSync(join(tmpdir(), "studio-collectors-"));
  writeFileSync(join(root, ".dev.vars"), vars);
  return root;
}

describe("readDevVars", () => {
  it("parses keys, skips comments and blanks, strips quotes", () => {
    const root = tmpRoot(
      '# comment\n\nRESEND_API_KEY=re_test\nARTIST_SENDER="Gallery <a@b.c>"\nEMPTY=\nNOEQUALS\n',
    );
    assert.deepEqual(readDevVars(root), {
      RESEND_API_KEY: "re_test",
      ARTIST_SENDER: "Gallery <a@b.c>",
      EMPTY: "",
    });
  });

  it("reads blank without a file", () => {
    assert.deepEqual(
      readDevVars(mkdtempSync(join(tmpdir(), "studio-collectors-"))),
      {},
    );
  });
});

describe("collectorsEnv", () => {
  it("forces the mock on and passes mail settings through", () => {
    const root = tmpRoot(
      "RESEND_API_KEY=re_test\nARTIST_SENDER=G <a@b.c>\nARTIST_INBOX=a@b.c\nCOLLECTORS_MOCK=false\n",
    );
    const env = collectorsEnv(root, createCollectorsDb(root));
    assert.equal(env.COLLECTORS_MOCK, "true");
    assert.equal(env.RESEND_API_KEY, "re_test");
    assert.equal(env.ARTIST_SENDER, "G <a@b.c>");
    assert.equal(env.ARTIST_INBOX, "a@b.c");
  });
});

describe("collectorsDb", () => {
  it("walks the whole loop and survives a restart", async () => {
    const cache = mkdtempSync(join(tmpdir(), "studio-collectors-"));
    const sub = await mockSubscribe(
      {
        COLLECTORS_MOCK: "true",
        RESEND_API_KEY: "re_test",
        DB: createCollectorsDb(cache),
      },
      "fan@example.com",
    );
    assert.ok(sub !== null && !sub.already && sub.token !== "");
    // A fresh instance over the same cache still knows the row.
    const db2 = createCollectorsDb(cache);
    const env2 = {
      COLLECTORS_MOCK: "true",
      RESEND_API_KEY: "re_test",
      DB: db2,
    };
    assert.equal(await mockConfirm(env2, "fan@example.com", sub.token), true);
    assert.equal(await mockCount(env2), 1);
    await mockUnsubscribe(env2, "fan@example.com");
    assert.equal(await mockCount(env2), 0);
  });
});
