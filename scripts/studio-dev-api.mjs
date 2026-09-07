/**
 * Local studio backend for `pnpm dev:studio`: the same /api/commit +
 * /api/photo contract the Pages Functions serve in production, but backed
 * by the working tree instead of GitHub. Writes land as uncommitted files
 * (review with git, reset with `pnpm studio:reset`) — nothing here ever
 * ships or runs outside localhost dev.
 *
 * Pure Request/Response handlers over a repo root, so unit tests can drive
 * them with a tmp dir and no socket.
 */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

/** Repo path of the homepage banner (empty file = hidden). */
export const BANNER_PATH = "src/content/announcement.txt";
const PAINTINGS_DIR = "src/content/paintings";

const PAINTING_FILE =
  /^src\/content\/paintings\/[A-Za-z0-9][A-Za-z0-9_.-]*\.md$/;

/** Repo paths the studio may write or delete — mirrors functions/api/commit. */
const GALLERY_PATH =
  /^(src\/content\/paintings\/[A-Za-z0-9][A-Za-z0-9_.-]*|src\/content\/announcement\.txt|public\/models\/[A-Za-z0-9][A-Za-z0-9_.-]*)$/;

const PHOTO_FILE =
  /^src\/content\/paintings\/[A-Za-z0-9][A-Za-z0-9_.-]*\.(jpg|jpeg|png|webp|heic)$/i;

const IMAGE_TYPE = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
};

const MAX_BASE64 = 24_000_000;

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
}

/** Belt and suspenders behind the regex allowlists: never escape root. */
function withinRoot(root, rel) {
  const resolved = resolve(root, rel);
  return resolved === root || resolved.startsWith(root + sep) ? resolved : null;
}

async function readText(abs) {
  try {
    return await readFile(abs, "utf8");
  } catch {
    return null;
  }
}

export function createStudioDevApi(root) {
  async function handleCommitGet(req) {
    const url = new URL(req.url);
    const path = url.searchParams.get("path");
    if (path !== null) {
      if (!PAINTING_FILE.test(path))
        return json({ error: "Unknown file" }, { status: 400 });
      const abs = withinRoot(root, path);
      const content = abs === null ? null : await readText(abs);
      if (content === null)
        return json({ error: "Unknown file" }, { status: 400 });
      return json({ content });
    }
    const abs = withinRoot(root, BANNER_PATH);
    const announcement = abs === null ? "" : ((await readText(abs)) ?? "");
    return json({ announcement });
  }

  async function handleCommitPut() {
    const abs = withinRoot(root, PAINTINGS_DIR);
    if (abs === null)
      return json(
        { error: "Refusing to list outside the gallery" },
        { status: 400 },
      );
    let files;
    try {
      files = (await readdir(abs)).filter((f) => f.endsWith(".md"));
    } catch {
      return json(
        { error: "Couldn't list the paintings folder" },
        { status: 500 },
      );
    }
    return json({ files });
  }

  async function handleCommitPost(req) {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (typeof body !== "object" || body === null) {
      return json({ error: "Invalid JSON" }, { status: 400 });
    }
    const message =
      typeof body.message === "string" ? body.message.trim().slice(0, 200) : "";
    const inputs = Array.isArray(body.files) ? body.files : [];
    const deletes = Array.isArray(body.delete) ? body.delete : [];
    const deletePaths = [];
    for (const d of deletes) {
      if (typeof d !== "string" || !GALLERY_PATH.test(d)) {
        return json(
          { error: `Refusing to delete outside the gallery: ${String(d)}` },
          { status: 400 },
        );
      }
      deletePaths.push(d);
    }
    if (
      message === "" ||
      inputs.length + deletePaths.length === 0 ||
      inputs.length + deletePaths.length > 12
    ) {
      return json(
        { error: "A message and 1–12 files are required" },
        { status: 400 },
      );
    }
    const writes = [];
    for (const input of inputs) {
      if (
        typeof input !== "object" ||
        input === null ||
        typeof input.path !== "string" ||
        typeof input.contentBase64 !== "string"
      ) {
        return json(
          { error: "Each file needs a path and base64 content" },
          { status: 400 },
        );
      }
      if (!GALLERY_PATH.test(input.path)) {
        return json(
          { error: `Refusing to write outside the gallery: ${input.path}` },
          { status: 400 },
        );
      }
      if (input.contentBase64.length > MAX_BASE64) {
        return json(
          { error: `${input.path} is too large (24MB base64 cap)` },
          { status: 400 },
        );
      }
      let bytes;
      try {
        bytes = Buffer.from(input.contentBase64, "base64");
      } catch {
        return json(
          { error: `${input.path} is not valid base64` },
          { status: 400 },
        );
      }
      const abs = withinRoot(root, input.path);
      if (abs === null) {
        return json(
          { error: `Refusing to write outside the gallery: ${input.path}` },
          { status: 400 },
        );
      }
      writes.push({ abs, bytes });
    }
    for (const d of deletePaths) {
      const abs = withinRoot(root, d);
      if (abs === null) {
        return json(
          { error: `Refusing to delete outside the gallery: ${d}` },
          { status: 400 },
        );
      }
    }
    try {
      for (const w of writes) {
        await mkdir(dirname(w.abs), { recursive: true });
        await writeFile(w.abs, w.bytes);
      }
      for (const d of deletePaths) {
        const abs = withinRoot(root, d);
        if (abs !== null) await rm(abs, { force: true });
      }
    } catch (err) {
      console.error(err);
      return json(
        { error: "Couldn't write to the working tree" },
        { status: 500 },
      );
    }
    return json({ ok: true, commit: "local" }, { status: 201 });
  }

  async function handleCommit(req) {
    if (req.method === "GET") return handleCommitGet(req);
    if (req.method === "PUT") return handleCommitPut();
    if (req.method === "POST") return handleCommitPost(req);
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  async function handlePhoto(req) {
    if (req.method !== "GET") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }
    const path = new URL(req.url).searchParams.get("path") ?? "";
    if (!PHOTO_FILE.test(path))
      return json({ error: "Unknown photo" }, { status: 400 });
    const abs = withinRoot(root, path);
    if (abs === null) return json({ error: "Unknown photo" }, { status: 400 });
    let bytes;
    try {
      bytes = await readFile(abs);
    } catch {
      return json({ error: "Unknown photo" }, { status: 400 });
    }
    const ext = (path.split(".").pop() ?? "jpg").toLowerCase();
    return new Response(bytes, {
      headers: { "content-type": IMAGE_TYPE[ext] ?? "image/jpeg" },
    });
  }

  return { handleCommit, handlePhoto };
}
