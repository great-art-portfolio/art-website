import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseCommitBody,
  parseGitHubDir,
  parseGitHubFile,
  parseJwk,
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
