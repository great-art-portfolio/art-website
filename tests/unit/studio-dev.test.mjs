import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStudioDevApi } from "../../scripts/studio-dev-api.mjs";

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

async function seed() {
  const root = await mkdtemp(join(tmpdir(), "studio-dev-"));
  await mkdir(join(root, "src/content/paintings"), { recursive: true });
  await writeFile(
    join(root, "src/content/paintings/first-thaw.md"),
    '---\ntitle: "First Thaw"\n---\n\nBody.\n',
  );
  await writeFile(
    join(root, "src/content/paintings/first-thaw.jpg"),
    "fake-jpg",
  );
  return root;
}

function post(body) {
  return new Request("http://127.0.0.1/api/commit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("studio dev api", () => {
  let root;
  let api;
  beforeEach(async () => {
    root = await seed();
    api = createStudioDevApi(root);
  });

  it("reads an empty banner, writes one, reads it back", async () => {
    let res = await api.handleCommit(
      new Request("http://127.0.0.1/api/commit"),
    );
    assert.equal(res.status, 200);
    assert.equal((await res.json()).announcement, "");

    res = await api.handleCommit(
      post({
        message: "Update homepage banner",
        files: [
          {
            path: "src/content/announcement.txt",
            contentBase64: b64("Lilac Festival!"),
          },
        ],
      }),
    );
    assert.equal(res.status, 201);

    res = await api.handleCommit(new Request("http://127.0.0.1/api/commit"));
    assert.equal((await res.json()).announcement, "Lilac Festival!");
  });

  it("lists, reads, and patches a painting file", async () => {
    let res = await api.handleCommit(
      new Request("http://127.0.0.1/api/commit", { method: "PUT" }),
    );
    assert.deepEqual((await res.json()).files, ["first-thaw.md"]);

    res = await api.handleCommit(
      new Request(
        "http://127.0.0.1/api/commit?path=src%2Fcontent%2Fpaintings%2Ffirst-thaw.md",
      ),
    );
    assert.match((await res.json()).content, /First Thaw/);

    res = await api.handleCommit(
      post({
        message: "Edit painting: First Thaw",
        files: [
          {
            path: "src/content/paintings/first-thaw.md",
            contentBase64: b64('---\ntitle: "First Thaw"\n---\n\nNew body.\n'),
          },
        ],
      }),
    );
    assert.equal(res.status, 201);
    const saved = await readFile(
      join(root, "src/content/paintings/first-thaw.md"),
      "utf8",
    );
    assert.match(saved, /New body/);
  });

  it("writes binary uploads and serves the photo back", async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);
    const res = await api.handleCommit(
      post({
        message: "Add painting: New",
        files: [
          {
            path: "src/content/paintings/new.md",
            contentBase64: b64("hi"),
          },
          {
            path: "src/content/paintings/new.jpg",
            contentBase64: bytes.toString("base64"),
          },
        ],
      }),
    );
    assert.equal(res.status, 201);

    const photo = await api.handlePhoto(
      new Request(
        "http://127.0.0.1/api/photo?path=src%2Fcontent%2Fpaintings%2Fnew.jpg",
      ),
    );
    assert.equal(photo.status, 200);
    assert.equal(photo.headers.get("content-type"), "image/jpeg");
    assert.deepEqual(Buffer.from(await photo.arrayBuffer()), bytes);
  });

  it("deletes gallery files", async () => {
    let res = await api.handleCommit(
      post({
        message: "Delete painting: First Thaw",
        files: [],
        delete: [
          "src/content/paintings/first-thaw.md",
          "src/content/paintings/first-thaw.jpg",
        ],
      }),
    );
    assert.equal(res.status, 201);
    res = await api.handleCommit(
      new Request("http://127.0.0.1/api/commit", { method: "PUT" }),
    );
    assert.deepEqual((await res.json()).files, []);
  });

  it("refuses paths outside the gallery", async () => {
    for (const path of ["src/lib/site.ts", "../outside.md", "package.json"]) {
      const res = await api.handleCommit(
        post({ message: "nope", files: [{ path, contentBase64: b64("x") }] }),
      );
      assert.equal(res.status, 400, path);
    }
    const photo = await api.handlePhoto(
      new Request("http://127.0.0.1/api/photo?path=package.json"),
    );
    assert.equal(photo.status, 400);
  });

  it("reads unknown files as unknown, not crashes", async () => {
    const res = await api.handleCommit(
      new Request(
        "http://127.0.0.1/api/commit?path=src%2Fcontent%2Fpaintings%2Fmissing.md",
      ),
    );
    assert.equal(res.status, 400);
    const photo = await api.handlePhoto(
      new Request(
        "http://127.0.0.1/api/photo?path=src%2Fcontent%2Fpaintings%2Fmissing.jpg",
      ),
    );
    assert.equal(photo.status, 400);
  });

  it("answers the studio-dev presence probe", async () => {
    const res = await api.handleProbe();
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { local: true });
  });

  it("requires a message and 1–12 files", async () => {
    let res = await api.handleCommit(post({ message: "", files: [] }));
    assert.equal(res.status, 400);
    res = await api.handleCommit(post({ message: "x", files: [] }));
    assert.equal(res.status, 400);
  });
});
