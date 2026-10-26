import {
  commitFiles,
  gitConfig,
  githubKeyExpiry,
  listDir,
  readTextFile,
  type RepoFile,
} from "../_lib/github";
import type { AppEnv } from "../_lib/env";
import { badRequest, githubFailure, json, requireAdmin } from "../_lib/http";
import { parseCommitBody } from "../_lib/validation";

/** Repo path of the homepage banner. An empty file hides it. */
export const BANNER_PATH = "src/content/announcement.txt";

import { GALLERY_PATH, isReadableFile } from "../_lib/gallery-paths";

/** Text files go inline in the commit; everything else is one upload each,
 * which Workers' subrequest limit caps. */
const TEXT_FILE = /\.(md|txt|json)$/i;
const MAX_FILES = 100;
const MAX_BINARIES = 12;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** Admin: reads the banner text, or one painting file with ?path=. */
export const onRequestGet: PagesFunction<AppEnv> = async (context) => {
  const denied = await requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  const config = gitConfig(context.env);
  if (config === null) return badRequest("GitHub publishing is not configured");
  const url = new URL(context.request.url);
  const path = url.searchParams.get("path");
  try {
    if (path !== null) {
      if (!isReadableFile(path)) return badRequest("Unknown file");
      const content = await readTextFile(config, path);
      if (content === null) return badRequest("Unknown file");
      return json({ content });
    }
    return json({
      announcement: (await readTextFile(config, BANNER_PATH)) ?? "",
    });
  } catch (err) {
    return githubFailure(err);
  }
};

/**
 * Admin: commits a batch of files (painting .md and photo, banner text, AR
 * models) and deletes gallery files. Body:
 * { message, files: [{ path, contentBase64 }], delete: [path] }.
 * Cloudflare Pages rebuilds on push, so changes are live about a minute
 * later.
 */
export const onRequestPost: PagesFunction<AppEnv> = async (context) => {
  const denied = await requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  const config = gitConfig(context.env);
  if (config === null) return badRequest("GitHub publishing is not configured");
  let raw: unknown;
  try {
    raw = (await context.request.json()) as unknown;
  } catch {
    return badRequest("Invalid JSON");
  }
  const body = parseCommitBody(raw);
  if (body === null) return badRequest("Invalid JSON");
  const message = body.message.trim().slice(0, 200);
  const inputs = body.inputs;
  const deletePaths: string[] = [];
  for (const d of body.deletes) {
    if (typeof d !== "string" || !GALLERY_PATH.test(d)) {
      return badRequest(`Refusing to delete outside the gallery: ${String(d)}`);
    }
    deletePaths.push(d);
  }
  const binaries = inputs.filter(
    (f) => typeof f.path === "string" && !TEXT_FILE.test(f.path),
  ).length;
  if (
    message === "" ||
    inputs.length + deletePaths.length === 0 ||
    inputs.length + deletePaths.length > MAX_FILES ||
    binaries > MAX_BINARIES
  ) {
    return badRequest(
      `A message and 1–${MAX_FILES} files (at most ${MAX_BINARIES} photos or models) are required`,
    );
  }
  const files: RepoFile[] = [];
  for (const input of inputs) {
    if (
      typeof input.path !== "string" ||
      typeof input.contentBase64 !== "string"
    ) {
      return badRequest("Each file needs a path and base64 content");
    }
    if (!GALLERY_PATH.test(input.path)) {
      return badRequest(`Refusing to write outside the gallery: ${input.path}`);
    }
    if (input.contentBase64.length > 24_000_000) {
      return badRequest(`${input.path} is too large (24MB base64 cap)`);
    }
    if (!BASE64.test(input.contentBase64)) {
      return badRequest(`${input.path} is not valid base64`);
    }
    if (TEXT_FILE.test(input.path)) {
      // Small text: decoded here and written inline, no upload needed.
      const bin = atob(input.contentBase64);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      files.push({ path: input.path, text: new TextDecoder().decode(bytes) });
    } else {
      // Photos and models pass through as base64: decoding megabytes would
      // spend the Worker's CPU budget for nothing.
      files.push({ path: input.path, base64: input.contentBase64 });
    }
  }
  for (const path of deletePaths) files.push({ path, deleted: true });
  try {
    const sha = await commitFiles(config, message, files, { rebase: true });
    return json({ ok: true, commit: sha }, { status: 201 });
  } catch (err) {
    return githubFailure(err, "Publishing failed — the commit did not land.");
  }
};

/** Admin: lists filenames in the paintings folder for slug collision
 * checks. */
export const onRequestPut: PagesFunction<AppEnv> = async (context) => {
  const denied = await requireAdmin(context.request, context.env);
  if (denied !== null) return denied;
  const config = gitConfig(context.env);
  if (config === null) return badRequest("GitHub publishing is not configured");
  try {
    const files = await listDir(config, "src/content/paintings");
    // The studio warns her ahead of the key's last day.
    return json({ files, keyExpires: githubKeyExpiry() });
  } catch (err) {
    return githubFailure(err);
  }
};
