import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { modelGlbOrEmpty } from "../../src/lib/model-files.ts";

describe("modelGlbOrEmpty", () => {
  it("keeps refs whose file is in public/", () => {
    assert.equal(
      modelGlbOrEmpty("/models/2510x2478.glb"),
      "/models/2510x2478.glb",
    );
  });

  it("empties dangling, blank, and missing refs", () => {
    assert.equal(modelGlbOrEmpty("/models/no-such-painting.glb"), "");
    assert.equal(modelGlbOrEmpty(""), "");
    assert.equal(modelGlbOrEmpty(undefined), "");
  });
});
