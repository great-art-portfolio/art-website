import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseCommitBody,
  parseGitHubDir,
  parseGitHubFile,
  parseJwk,
  parsePushSubscribe,
  parsePushUnsubscribe,
} from "../../functions/_lib/validation.ts";

describe("parseCommitBody", () => {
  it("accepts a full commit body", () => {
    const body = parseCommitBody({
      message: "Save",
      files: [{ path: "a.md", contentBase64: "eA==" }],
      delete: ["b.md"],
    });
    assert.equal(body?.message, "Save");
    assert.equal(body?.inputs.length, 1);
    assert.deepEqual(body?.deletes, ["b.md"]);
  });

  it("falls back wrong-typed fields like the old hand checks", () => {
    const body = parseCommitBody({ message: 5, files: "x" });
    assert.equal(body?.message, "");
    assert.deepEqual(body?.inputs, []);
  });

  it("rejects a non-object body", () => {
    assert.equal(parseCommitBody(null), null);
    assert.equal(parseCommitBody("hi"), null);
  });
});

describe("parseGitHubFile", () => {
  it("accepts a contents answer", () => {
    assert.deepEqual(parseGitHubFile({ content: "eA==", encoding: "base64" }), {
      content: "eA==",
      encoding: "base64",
    });
  });

  it("rejects garbage", () => {
    assert.equal(parseGitHubFile(null), null);
    assert.equal(parseGitHubFile(42), null);
  });
});

describe("parseGitHubDir", () => {
  it("keeps valid entries and drops the rest", () => {
    const entries = parseGitHubDir([{ name: "a.md" }, 7, {}]);
    assert.deepEqual(entries, [{ name: "a.md" }, {}]);
  });

  it("reads a non-list as empty", () => {
    assert.deepEqual(parseGitHubDir({ message: "nope" }), []);
  });
});

describe("parseJwk", () => {
  it("accepts five EC strings", () => {
    const jwk = parseJwk({ kty: "EC", crv: "P-256", x: "x", y: "y", d: "d" });
    assert.equal(jwk?.kty, "EC");
  });

  it("rejects a partial key", () => {
    assert.equal(parseJwk({ kty: "EC" }), null);
    assert.equal(parseJwk(null), null);
  });
});

describe("parsePushSubscribe", () => {
  it("accepts a browser subscription", () => {
    const sub = parsePushSubscribe({
      action: "subscribe",
      subscription: {
        endpoint: "https://push.example.com/abc",
        keys: { p256dh: "p", auth: "a" },
      },
    });
    assert.equal(sub?.endpoint, "https://push.example.com/abc");
    assert.equal(sub?.p256dh, "p");
    assert.equal(sub?.auth, "a");
  });

  it("rejects non-https and malformed endpoints like the old hand checks", () => {
    assert.equal(
      parsePushSubscribe({
        subscription: { endpoint: "http://push.example.com/abc" },
      }),
      null,
    );
    assert.equal(
      parsePushSubscribe({ subscription: { endpoint: "https://" } }),
      null,
    );
    assert.equal(parsePushSubscribe({ subscription: {} }), null);
    assert.equal(parsePushSubscribe(null), null);
  });

  it("missing keys ride as empty strings", () => {
    const sub = parsePushSubscribe({
      subscription: { endpoint: "https://push.example.com/abc" },
    });
    assert.equal(sub?.p256dh, "");
    assert.equal(sub?.auth, "");
  });
});

describe("parsePushUnsubscribe", () => {
  it("accepts an endpoint and rejects empties", () => {
    assert.equal(
      parsePushUnsubscribe({ action: "unsubscribe", endpoint: "https://x" }),
      "https://x",
    );
    assert.equal(parsePushUnsubscribe({ endpoint: "" }), null);
    assert.equal(parsePushUnsubscribe(null), null);
  });
});
